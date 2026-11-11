'use client'

import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  ColorScheme,
  Map,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  isFoodPlaceType,
} from '@harema/shared/constants'
import { clientEnv } from '@/env/client'
import { fetchPlaceFields, getPlaceDetails } from '@/lib/places/details-cache'
import { installModalTiming } from '@/lib/install-prompt'
import { takePendingShare } from '@/lib/share-pending'
import { AccountDrawer, type AccountSnapshot } from '../account/drawer'
import { CurrentLocationButton } from './current-location-button'
import { CurrentLocationMarker } from './current-location-marker'
import { HomeScreenDialog } from './home-screen-dialog'
import { LocationPermissionBanner } from './location-permission-banner'
import { MapChrome } from './map-chrome'
import { MapsLoadFailCard } from './maps-load-fail-card'
import { MapToast } from './map-toast'
import { OfflineOverlay } from './offline-overlay'
import { Pin } from './pin'
import { SaveSheet } from './save-sheet'
import { SearchSuggestions } from './search-suggestions'
import {
  EMPTY_SOURCE_STATE,
  sourceOnCloseSearch,
  sourceOnCloseSheet,
  sourceOnLaunch,
  sourceOnOpenSheet,
  type SourceState,
} from './sheet-initial'
import type {
  MapLaunchContext,
  MapToastVariant,
  SavedPlaceMarker,
  SearchMode,
} from './types'
import {
  useAutocompleteSuggestions,
  type ClassifiedSuggestion,
} from './use-autocomplete-suggestions'
import { MAP_EDGE_INSET } from './sheet-cover'
import { useInstallPrompt } from './use-install-prompt'
import { useMapsAuthFailure } from './use-maps-auth-failure'
import { useSheetCover } from './use-sheet-cover'
import { watchErrorRevokesLocation } from './watch-error'

/** `<Map>` の外(兄弟のクローム)から `useMap(id)` で同じ地図を参照するための instance id。 */
const MAP_INSTANCE_ID = 'harema-map'

/** トースト退場アニメの尺。globals.css の `--dur-slow: 240ms` と一致させる(退場後に unmount)。 */
const TOAST_EXIT_MS = 240

/** ⑨ の再試行スピナーの最低表示時間(裁定 2026-07-31)。拒否のままだと 54ms で確定して見えない。 */
const RETRY_SPINNER_MIN_MS = 600

type LocationState = 'idle' | 'granted' | 'denied' | 'unavailable'

type MapScreenProps = {
  savedPlaces: SavedPlaceMarker[]
  /**
   * アカウント管理(WP-11・右ドロワー)の現在値。Server Component の page.tsx が getVerifiedUser() +
   * profiles から取り、ここは drawer へ渡すだけ(browser client は使わない)。
   */
  account: AccountSnapshot
}

export function MapScreen({ savedPlaces, account }: MapScreenProps) {
  return (
    <APIProvider apiKey={clientEnv.googleMapsApiKey} language="ja" region="JP">
      <MapView savedPlaces={savedPlaces} account={account} />
    </APIProvider>
  )
}

function MapView({ savedPlaces, account }: MapScreenProps) {
  const map = useMap(MAP_INSTANCE_ID)
  const places = useMapsLibrary('places')
  const apiStatus = useApiLoadingStatus()
  // Maps JS 本体が読み込めなかった(面 10・WP-10 S10)。地図は 1 枚も描けていないので下地を
  // 出さない(design のオフライン面 B-4 との見分け方)。
  // 鍵の拒否(gm_authFailure)も同じ扱い: vis.gl は AUTH_FAILURE を立てず、放置すると
  // 地図の上の物を動かした時に Google の中で TypeError が出て error.tsx(500)に落ちる。
  const mapsAuthFailed = useMapsAuthFailure()
  const mapsFailed = apiStatus === APILoadingStatus.FAILED || mapsAuthFailed
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [mode, setMode] = useState<SearchMode>('store')
  const [query, setQuery] = useState('')
  // IME の変換中(map-chrome の compositionstart / end が更新する)。候補の発火条件に効くので、
  // ref ではなく state で持つ —— 確定した瞬間に取得を走らせる必要がある。
  const [composing, setComposing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // 共有から来た出典。launchSource = 検索を開いたときの値、sheetSource = 開いたシートへ渡す値
  // (closeSearch が launchSource を捨てるので、シートへ渡す値は別に持つ)。
  const [source, setSource] = useState<SourceState>(EMPTY_SOURCE_STATE)
  // 共有の続き(/share が置いた中身)は最初の mount で 1 回だけ読む(StrictMode の 2 回目で上書きしない)。
  const pendingShareReadRef = useRef(false)
  // アカウント右ドロワー(WP-11・design E-0)。≡ で開き、スクリム / 右スワイプで閉じる。
  const [drawerOpen, setDrawerOpen] = useState(false)
  // メニューから開いたユーザー名変更・退会のダイアログ(drawer が持つ状態の写し)。
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  // geolocation API が無い環境は要求しても現在地を出せないので初期から 'unavailable'
  // (既定エリアのまま・バナー無し)。SSR は navigator 不在で 'unavailable' になるが、いずれの
  // 値でもボタンは非 disabled・バナー非表示で DOM は一致する。
  const [locationState, setLocationState] = useState<LocationState>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator
      ? 'idle'
      : 'unavailable',
  )
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // ホーム画面に追加する案内(Android の Chrome だけ)。モーダルは位置情報の許可を求めている最中(idle)・
  // 共有の続きの検索・保存シート・メニューが開いている間は出さない(出す間隔と記録は lib/install-prompt.ts)。
  const installPrompt = useInstallPrompt()
  const [retryingLocation, setRetryingLocation] = useState(false)
  const retrySpinnerTimerRef = useRef<number | undefined>(undefined)
  // 連打ガード(in-flight)。解決前の再入を捨てる —— Place Details は 1 回ごとに課金される。
  // 再描画に関わらない値なので ref に置く。
  const placeFetchInFlightRef = useRef(false)
  const locationInFlightRef = useRef(false)
  // パン待ちの座標。立てるのは初回マウントの成功と「現在地に戻る」押下の成功だけ。
  const pendingPanRef = useRef<google.maps.LatLngLiteral | null>(null)
  const [offline, setOffline] = useState(false)
  const [currentPosition, setCurrentPosition] = useState<
    (google.maps.LatLngLiteral & { accuracy: number | null }) | null
  >(null)

  // S1 の起動コンテキスト。null = シートを出していない。
  const [sheetContext, setSheetContext] = useState<MapLaunchContext | null>(null)
  const showHomeDialog =
    installPrompt.modalDue &&
    installModalTiming({
      locationPending: locationState === 'idle',
      searchOpen,
      sheetOpen: sheetContext !== null,
      drawerOpen: drawerOpen || accountDialogOpen,
    })
  // シートが開いている間、地図の器の下端をシートの上端まで縮める(Google の帰属表示を隠さない。
  // https://developers.google.com/maps/documentation/javascript/policies)。bottom は hook が
  // DOM に直接書く(器の props の bottom は 0 のまま)。
  const mapBoxRef = useRef<HTMLDivElement | null>(null)
  const sheetWrapperRef = useRef<HTMLDivElement | null>(null)
  useSheetCover(sheetContext !== null, mapBoxRef, sheetWrapperRef)

  const [toast, setToast] = useState<{
    nonce: number
    variant: MapToastVariant
  } | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const toastExitTimerRef = useRef<number | null>(null)

  const clearToastExitTimer = useCallback(() => {
    if (toastExitTimerRef.current !== null) {
      window.clearTimeout(toastExitTimerRef.current)
      toastExitTimerRef.current = null
    }
  }, [])

  const showToast = useCallback(
    (variant: MapToastVariant) => {
      // 退場中のタイマーを止めてから出す(直後の新トーストを古い退場が消さないように)。
      clearToastExitTimer()
      setToast((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, variant }))
    },
    [clearToastExitTimer],
  )

  // 候補取得の失敗は A(suggestions)。useAutocompleteSuggestions が ref 経由で保持するため
  // 参照を安定させる。
  const showSuggestionsErrorToast = useCallback(
    () => showToast('suggestions'),
    [showToast],
  )

  const dismissToast = useCallback(() => {
    setToastVisible(false)
    clearToastExitTimer()
    toastExitTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastExitTimerRef.current = null
    }, TOAST_EXIT_MS)
  }, [clearToastExitTimer])

  useEffect(() => clearToastExitTimer, [clearToastExitTimer])

  // 検索候補は「いま見えている地図の範囲」に寄せる。旅行先へパンしてから店を探す動線で
  // 画面と候補がずれないため(現在地に寄せたいときは「現在地に戻る」でカメラごと移動する)。
  // bias は優先付けであって絞り込みではないので、範囲外の候補も出る。
  // 範囲がまだ無いとき(map 生成前・初回 idle 前)は既定エリア(東京駅)へ落とす —— ここで
  // currentPosition に落とすと現在地の点そのものを送ることになり、spec §7 に反する。
  const getLocationBias = useCallback(
    () => map?.getBounds()?.toJSON() ?? DEFAULT_MAP_CENTER,
    [map],
  )

  const { suggestions, resetSession, discardSessionToken } = useAutocompleteSuggestions({
    places,
    input: query,
    enabled: searchOpen && !offline,
    composing,
    getLocationBias,
    onError: showSuggestionsErrorToast,
  })

  // 位置情報を要求する(初回マウント + 現在地ボタン)。許可 = 現在地へパン + ドット描画 /
  // 拒否 = B-5 バナー / その他(timeout 等)= バナーなしで既定エリア(東京駅)のまま。
  const applyPosition = useCallback((position: GeolocationPosition) => {
    setLocationState('granted')
    setCurrentPosition({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    })
  }, [])

  const applyLocationError = useCallback((error: GeolocationPositionError) => {
    setLocationState(
      error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
    )
  }, [])

  // 位置取得の唯一の入口。`settled` は成功/失敗のどちらでも 1 回だけ呼ばれる後始末で、バナーの
  // 再試行が処理中表示を降ろすのに使う(取得の待ち時間はここでしか分からない)。`pan` を立てた
  // 呼び出しだけが地図を動かす(spec §7:ドットの更新で中心は追従しない)。
  const getPosition = useCallback(
    (options?: { pan?: boolean; settled?: () => void }) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        options?.settled?.()
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          options?.settled?.()
          applyPosition(position)
          if (options?.pan) {
            pendingPanRef.current = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }
          }
        },
        (error) => {
          options?.settled?.()
          applyLocationError(error)
        },
        { timeout: 10000 },
      )
    },
    [applyPosition, applyLocationError],
  )

  // 初回マウントと現在地ボタンで共有する単一の要求関数。この 2 つだけがパン契機。
  // API 不在は初期 state 'unavailable' が表すので、ここでは同期 setState せず return する
  // (effect から呼んでも React 19 set-state-in-effect に触れない・setState は非同期コールバック内だけ)。
  // 解決前の再入は捨てる —— 連打で位置要求を積み上げても、遅れて返った古い座標でパンし直すだけ。
  const requestLocation = useCallback(() => {
    if (locationInFlightRef.current) return
    locationInFlightRef.current = true
    getPosition({
      pan: true,
      settled: () => {
        locationInFlightRef.current = false
      },
    })
  }, [getPosition])

  // バナーの再試行(⑨)。端末側で許可へ変えたあとの手動契機で、成功すれば locationState が
  // 'granted' になり showBanner が false になる。失敗すれば 'denied' のままバナーが残るので、
  // 処理中表示を降ろすために settled を渡す。ここは event handler なので同期 setState でよい。
  // 降ろすのは押下から最低表示時間が経ってから(長引いた取得に足し込まない)。成功時は settled の
  // 直後に同期で 'granted' へ移りバナーごと畳まれるので、この保持が成功体験を遅らせることはない。
  const retryLocation = useCallback(() => {
    setRetryingLocation(true)
    const startedAt = Date.now()
    getPosition({
      settled: () => {
        const elapsed = Date.now() - startedAt
        retrySpinnerTimerRef.current = window.setTimeout(
          () => setRetryingLocation(false),
          Math.max(RETRY_SPINNER_MIN_MS - elapsed, 0),
        )
      },
    })
  }, [getPosition])

  useEffect(() => () => window.clearTimeout(retrySpinnerTimerRef.current), [])

  useEffect(() => {
    requestLocation()
  }, [requestLocation])

  // パン要求の消化。map はマウント直後 null なので、要求を立てた時点で必ず消化できるとは限らず、
  // map が用意できた最初の描画まで持ち越す。要求は ref に置く(有無で再描画する必要がないため)。
  // watch の更新とバナーの再試行は要求を立てないので、ここを通っても地図は動かない。
  useEffect(() => {
    const target = pendingPanRef.current
    if (!map || !target) return
    pendingPanRef.current = null
    map.panTo(target)
  }, [map, currentPosition])

  // 許可が確定してから watch を張る(マウント時に getCurrentPosition と同時に張ると OS の
  // プロンプトが二重に出うる)。更新するのはドットの位置だけで、地図の中心は動かさない。
  // 取得した座標は hareMa の DB・サーバへ送らず、ログにも出さない。検索の bias に載るのは
  // 地図の表示範囲だけで(getLocationBias は currentPosition を参照しない)、watch の更新が
  // Google へのリクエストを増やすことも、現在地の点を送ることもない(spec §7)。
  useEffect(() => {
    if (locationState !== 'granted') return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    // 許可の取り消し(PERMISSION_DENIED)だけを applyLocationError に渡す。locationState が
    // 'denied' に落ちてこの effect のクリーンアップが clearWatch し、ドットが消えてバナーが出る。
    // 一時的な測位の失敗(POSITION_UNAVAILABLE・TIMEOUT)は、許可は残っているので状態を変えず、
    // 最後に取れた位置のドットを残して watch を続ける(N-3: 黙ってドットが消えるのを防ぐ)。
    const watchId = navigator.geolocation.watchPosition(
      applyPosition,
      (error) => {
        if (watchErrorRevokesLocation(error.code)) applyLocationError(error)
      },
      { enableHighAccuracy: false },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [locationState, applyPosition, applyLocationError])

  // オフライン検知(B-4)。navigator は client のみなので mount 後に読む。
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // トーストの入場 + 4 秒自動退場(nonce 変化でタイマーを引き直す)。
  useEffect(() => {
    if (!toast) return
    const enterId = window.requestAnimationFrame(() => setToastVisible(true))
    const dismissId = window.setTimeout(dismissToast, 4000)
    return () => {
      window.cancelAnimationFrame(enterId)
      window.clearTimeout(dismissId)
    }
  }, [toast, dismissToast])

  useEffect(() => {
    if (pendingShareReadRef.current) return
    pendingShareReadRef.current = true
    const apply = () => {
      const pending = takePendingShare()
      if (!pending) return
      // query が空でも検索は開く(iOS と同じ)。
      setSearchOpen(true)
      setQuery(pending.query)
      setSource((state) => sourceOnLaunch(state, pending.sourceText))
    }
    apply()
  }, [])

  const closeSearch = useCallback(() => {
    setSource(sourceOnCloseSearch)
    setSearchOpen(false)
    // 検索を閉じるたびにスイッチはオフ(飲食店だけ)へ戻す(所有者 2026-11-05 02:48)
    setMode('store')
    setQuery('')
    setComposing(false)
    resetSession()
  }, [resetSession])

  // 候補選択の確定。飲食 = launch context を組んでシームへ / 場所 = パンのみ。
  // **キャッシュは読まない**(fetchPlaceFields = 書くだけ)—— セッションは Details 呼び出しで
  // 閉じるので、キャッシュから返すと閉じないセッションが残り候補側が課金対象に落ちる。
  //
  // 取得までが 1 セッションで、**その終端は成功だけではない** —— 失敗も座標欠落も同じくセッションの
  // 終わりなので、トークンの破棄は分岐ではなく終端(finally)に 1 つ置く。成功経路では closeSearch
  // が既に捨てているので二重に捨てるだけ(冪等)。失敗時に検索を閉じないのは、B トーストが
  // 「もう一度お選びください」と候補の残存を前提にしているため(spec §5)。
  const handleSelectSuggestion = useCallback(
    (item: ClassifiedSuggestion, bucket: 'food' | 'location') => {
      if (placeFetchInFlightRef.current) return
      placeFetchInFlightRef.current = true
      // 候補が出ている時点で places はロード済み。toPlace() 自体も places 参照を要さない。
      const place = item.prediction.toPlace()
      if (bucket === 'food') {
        void fetchPlaceFields(place, ['location', 'displayName', 'formattedAddress'])
          .then(() => {
            const loc = place.location
            if (!loc) {
              showToast('details')
              return
            }
            const location = { lat: loc.lat(), lng: loc.lng() }
            map?.panTo(location)
            // closeSearch が launchSource を捨てる前に、出典をシートへ移す。
            setSource(sourceOnOpenSheet)
            closeSearch()
            setSheetContext({
              googlePlaceId: place.id,
              displayName: place.displayName ?? item.mainText,
              formattedAddress: place.formattedAddress ?? '',
              location,
            })
          })
          .catch(() => showToast('details'))
          .finally(() => {
            placeFetchInFlightRef.current = false
            discardSessionToken()
          })
        return
      }
      void fetchPlaceFields(place, ['location', 'viewport'])
        .then(() => {
          if (place.viewport && map) {
            map.fitBounds(place.viewport)
          } else if (place.location) {
            map?.panTo({ lat: place.location.lat(), lng: place.location.lng() })
          }
          closeSearch()
        })
        .catch(() => showToast('details'))
        .finally(() => {
          placeFetchInFlightRef.current = false
          discardSessionToken()
        })
    },
    [map, closeSearch, showToast, discardSessionToken],
  )

  // POI ラベルタップ(confirmed item 3)。placeId があれば常に stop() で標準ポップアップを抑制し、
  // types を非同期取得して飲食ならシームへ、非飲食は無反応。POI の name は一時利用のみ(DB へ送らない)。
  // セッションを持たない経路なのでキャッシュを読んでよい —— 同じ POI の再タップは無課金になる。
  // 保存のピンも同じ入口を通る(所有者の決定 2026-11-05「地図上の未保存の名前をタップした時と同じ挙動で」)。
  const openPlaceSheet = useCallback(
    (placeId: string) => {
      if (!places) return
      if (placeFetchInFlightRef.current) return
      placeFetchInFlightRef.current = true
      void getPlaceDetails(places, placeId, [
        'types',
        'displayName',
        'location',
        'formattedAddress',
      ])
        .then((place) => {
          if (!isFoodPlaceType(place.types ?? [])) return
          const loc = place.location
          if (!loc) return
          const location = { lat: loc.lat(), lng: loc.lng() }
          map?.panTo(location)
          setSource(sourceOnOpenSheet)
          setSheetContext({
            googlePlaceId: place.id,
            displayName: place.displayName ?? '',
            formattedAddress: place.formattedAddress ?? '',
            location,
          })
        })
        .catch(() => showToast('details'))
        .finally(() => {
          placeFetchInFlightRef.current = false
        })
    },
    [places, map, showToast],
  )

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      const placeId = event.detail.placeId
      if (!placeId) return
      event.stop()
      openPlaceSheet(placeId)
    },
    [openPlaceSheet],
  )

  const handleRetry = useCallback(() => {
    setOffline(!navigator.onLine)
  }, [])

  const closeSheet = useCallback(() => {
    setSource(sourceOnCloseSheet)
    setSheetContext(null)
  }, [])

  // 保存後は「シートを閉じる → トースト → 状態別ピンへ反映」(spec §6.2・§7)。削除は
  // トーストを出さない(確定事項。§12-⑧-4)—— ピンそのものが消えるので通知の必要がない。
  // /map は cookie 依存の動的ルートなので、再描画は router.refresh() で取り直す
  // (transition の中で呼ぶ。WP-10 S9)。
  const handleSaved = useCallback(
    (mode: 'created' | 'updated' | 'deleted') => {
      setSource(sourceOnCloseSheet)
      setSheetContext(null)
      if (mode !== 'deleted') {
        showToast(mode === 'created' ? 'save-created' : 'save-updated')
      }
      startTransition(() => {
        router.refresh()
      })
    },
    [router, showToast],
  )

  // Maps JS 本体が読めないときも offline と同じ扱い(chrome disabled・検索無効・バナー無し。
  // design のオフライン面 B-4 に揃える。handoff `:42`)。offline が真なら既存の OfflineOverlay
  // を優先する(面 10 のカードと二重に重ねない。C-D6 で offline-overlay.tsx 自体は変更しない)。
  const showMapsFailFace = mapsFailed && !offline
  const chromeDisabled = offline || mapsFailed
  const locationDisabled = offline || mapsFailed || locationState === 'denied'
  const showBanner =
    locationState === 'denied' && !bannerDismissed && !offline && !mapsFailed
  // オフライン中・Maps JS 失敗中はスクリム/サジェストを出さない(検索状態は保持し、復帰時に
  // 再表示する)。
  const isSearchActive = searchOpen && !offline && !mapsFailed

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {mapsFailed ? (
        // 面 10:地図は 1 枚も描けていないので下地(タイル・ピン)を出さない。
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }} />
      ) : (
        <div
          ref={mapBoxRef}
          // 下端は .edge-tint(Safari のバーの色を外観に追従させる帯・globals.css)が塗るので、
          // 地図をその上で終える(MAP_EDGE_INSET)。保存シートの間は useSheetCover が書き換える。
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: MAP_EDGE_INSET }}
        >
          <Map
            id={MAP_INSTANCE_ID}
            mapId={clientEnv.googleMapsMapId}
            colorScheme={ColorScheme.FOLLOW_SYSTEM}
            defaultCenter={DEFAULT_MAP_CENTER}
            defaultZoom={DEFAULT_MAP_ZOOM}
            disableDefaultUI
            gestureHandling="greedy"
            onClick={handleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            {/* 現在地ドット(spec §7)。保存ピンより下(zIndex 0)・非インタラクティブ・常に 1 個。
                許可が外れたら消える(granted を条件に持つ)。 */}
            {locationState === 'granted' && currentPosition && (
              <CurrentLocationMarker
                position={currentPosition}
                accuracy={currentPosition.accuracy}
              />
            )}
            {savedPlaces.map((marker) => (
              <AdvancedMarker
                key={marker.id}
                position={{ lat: marker.latitude, lng: marker.longitude }}
                zIndex={marker.status === 'visit_again' ? 2 : 1}
                onClick={() => openPlaceSheet(marker.googlePlaceId)}
              >
                <Pin status={marker.status} />
              </AdvancedMarker>
            ))}
          </Map>
        </div>
      )}

      {showMapsFailFace && <MapsLoadFailCard />}

      {isSearchActive && (
        <div
          onClick={closeSearch}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            background: 'var(--map-scrim)',
          }}
        />
      )}

      <MapChrome
        query={query}
        onQueryChange={setQuery}
        onComposingChange={setComposing}
        onSearchFocus={() => setSearchOpen(true)}
        onClear={closeSearch}
        disabled={chromeDisabled}
        onMenuClick={() => setDrawerOpen(true)}
        toastSlot={
          toast && (
            <MapToast
              variant={toast.variant}
              visible={toastVisible}
              onDismiss={dismissToast}
            />
          )
        }
        // 検索を開いている間はサジェストがバナーの下に出るので、トーストを下げると候補を覆う。
        // それ以外(保存成功・地図の POI を押したときの失敗)はバナーの下に置く(D13 案 C)。
        toastBelowBanner={!isSearchActive}
        bannerSlot={
          showBanner && (
            <LocationPermissionBanner
              onDismiss={() => setBannerDismissed(true)}
              onRetry={retryLocation}
              retrying={retryingLocation}
            />
          )
        }
      >
        {isSearchActive && (
          <SearchSuggestions
            mode={mode}
            suggestions={suggestions}
            onSelect={handleSelectSuggestion}
            onModeChange={setMode}
          />
        )}
      </MapChrome>

      <CurrentLocationButton disabled={locationDisabled} onClick={requestLocation} />

      {/* S1(保存/編集シート)。スクリム 20 / シート 21 —— 現在地ボタン(15)より上、
          layout.tsx の .edge-tint(100)より下。 */}
      {sheetContext && (
        <div ref={sheetWrapperRef} style={{ display: 'contents' }}>
          <SaveSheet
            context={sheetContext}
            initialSourceText={source.sheetSource}
            onClose={closeSheet}
            onSaved={handleSaved}
            placesLibrary={places}
          />
        </div>
      )}

      {offline && <OfflineOverlay onRetry={handleRetry} />}

      {/* アカウント右ドロワー(WP-11・design E-0)。スクリム 40 / ドロワー 41・ダイアログは
          E-1/E-4 が 50 / 51・E-2/E-3 が 60 / 61 —— シート・削除確認(20〜31)より上、.edge-tint(100)より下。
          ダイアログの表示状態は drawer 側が持つので、閉じていても mount したままにする。 */}
      <AccountDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        account={account}
        onAddToHome={installPrompt.canAdd ? () => installPrompt.add(false) : undefined}
        onDialogChange={setAccountDialogOpen}
      />

      {showHomeDialog && (
        <HomeScreenDialog onAdd={installPrompt.add} onCancel={installPrompt.cancel} />
      )}
    </div>
  )
}
