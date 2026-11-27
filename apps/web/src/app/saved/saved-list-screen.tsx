'use client'

import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SAVED_PLACE_STATUSES,
  type SavedPlaceStatus,
} from '@harema/shared/constants'
import { filterByList, pinIconFor } from '@harema/shared/lists'
import { FullViewportShell } from '@/app/full-viewport-shell'
import { clientEnv } from '@/env/client'
import {
  LIST_PARAM,
  parseListParam,
  pathWithList,
  searchWithList,
} from '@/lib/lists/list-filter-url'
import {
  bulkBarRows,
  countsForTabs,
  listsForBulkAdd,
  resolveSelectedList,
  selectEntryEnabled,
  selectionLimitHit,
  toggleSelection,
} from '@/lib/lists/list-selection'
import { getPlaceDetails } from '@/lib/places/details-cache'
import { BulkBar } from '../lists/bulk-bar'
import { BulkDeleteDialog } from '../lists/bulk-delete-dialog'
import { changeListPlaces } from '../lists/list-actions'
import { ListChips } from '../lists/list-chips'
import { ListEditorSheet } from '../lists/list-editor-sheet'
import { ListSheet, useListSheetCover } from '../lists/list-sheet'
import { StatusPickSheet } from '../lists/status-pick-sheet'
import type { ListItem } from '../lists/types'
import { MapToast } from '../map/map-toast'
import type { BulkErrorToastVariant, BulkLimitToastVariant, ListToastVariant } from '../map/types'
import { bulkChangeStatus, bulkDeleteSavedPlaces } from './bulk-actions'
import { GoogleAttribution } from './google-attribution'
import {
  ADDRESS_GAP,
  ADDRESS_SLOT_HEIGHT,
  LIST_VISIBLE_ROWS,
  NAME_SLOT_HEIGHT,
  ROW_BORDER,
  ROW_PADDING_Y,
  listRegionHeight,
} from './list-map-layout'
import { SavedListMap } from './saved-list-map'
import type { PlaceDisplay, SavedListCounts, SavedListRow } from './types'
import { BODY, META, NUM, heading } from '../text-styles'

type SavedListScreenProps = {
  rows: SavedListRow[]
  counts: SavedListCounts
  initialStatus: SavedPlaceStatus
  /** 自分のリストの全行(札の列・行の絵・一括)。 */
  lists: ListItem[]
  /** リストを開いてよいか(ポリシー 4 回目の改定に同意した人だけ真)。偽の間、リストの部品(「選ぶ」・札の段・行のアイコンの枠・リストのシート)を描かない。 */
  listsOpen: boolean
}

/** トースト退場アニメの尺。globals.css の `--dur-slow: 240ms` と一致させる。 */
const TOAST_EXIT_MS = 240
const TOAST_VISIBLE_MS = 4000

/** 一覧の知らせ。リストの 3 種に、一括の状態の変更の後の「更新しました。」(保存のシートの文)と、一括の状態の変更・削除の失敗を足す。 */
type ScreenToastVariant =
  | ListToastVariant
  | BulkErrorToastVariant
  | BulkLimitToastVariant
  | 'save-updated'

/**
 * 一覧の外殻。`useMapsLibrary('places')` は `<APIProvider>` の内側でしか解決しないので、
 * 中身を分けてここで包む。地図は `saved-list-map.tsx` に 1 つ。一覧を開くたび(詳細から
 * 戻るたびを含む)に Map loads が 1 回(タブを替えても作り直さない)。
 */
export function SavedListScreen({ rows, counts, initialStatus, lists, listsOpen }: SavedListScreenProps) {
  // 地図の SDK の言語は表示言語に合わせる。region は国の書式と順位の指定なので JP のまま。
  const locale = useLocale()
  return (
    <APIProvider apiKey={clientEnv.googleMapsApiKey} language={locale} region="JP">
      <SavedListView rows={rows} counts={counts} initialStatus={initialStatus} lists={lists} listsOpen={listsOpen} />
    </APIProvider>
  )
}

function SavedListView({ rows, counts, initialStatus, lists, listsOpen }: SavedListScreenProps) {
  const t = useTranslations('web.savedList')
  const router = useRouter()
  const lt = useTranslations('web.lists')
  const common = useTranslations('web.common')
  const statusNames = useTranslations('savedPlaceStatus')
  const places = useMapsLibrary('places')
  const apiStatus = useApiLoadingStatus()
  const [status, setStatus] = useState<SavedPlaceStatus>(initialStatus)
  // ピンを押して選んだ行。タブを替える・地図の何も無い所を押すと外れる。
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // リストの絞り(null = すべて)。初期値は URL の `list`(uuid の形の時だけ)で、地図から引き継ぐ。
  // 自分のリストに無い id・消えたリストの id は「すべて」に戻す。解決済みの値は下の effect が URL に写す。
  const searchParams = useSearchParams()
  const [selectedListId, setSelectedListId] = useState<string | null>(() =>
    parseListParam(searchParams.get(LIST_PARAM)),
  )
  const activeListId = resolveSelectedList(selectedListId, lists)
  // 解決済みの絞りを URL の `list` に写す(ほかの query は残す)。履歴は積まない(replaceState)。
  // 書きを 0ms 遅らせる: 最初の読み込みでは、画面の effect が Next の replaceState の包み(AppRouter の effect)より先に走り、
  // 包まれる前に書くと Next の履歴の印を消して、後でその項目へブラウザの戻るで戻れなくなる。
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = searchWithList(window.location.search, activeListId)
      if (next === window.location.search) return
      window.history.replaceState(null, '', window.location.pathname + next)
    }, 0)
    return () => window.clearTimeout(id)
  }, [activeListId])
  // 「選ぶ」の状態(頭の入口から入る別の状態)。選んだ行は `saved_places.id`(100 件まで)。
  const [selecting, setSelecting] = useState(false)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  // シート。bulk = 一括の入れるリストを選ぶ。statusSheetOpen = 一括の状態を選ぶ。
  // newListOpen = 名前とアイコン(「入れるリストを選ぶ」の「新しいリスト」から開く。作ったら選んだ店をそのまま入れる)。
  // deleteConfirmOpen = 一括の削除の確認。busy = 一括の送信中(帯のボタンを押せなくする)。
  const [bulkSheet, setBulkSheet] = useState<'add' | null>(null)
  const [statusSheetOpen, setStatusSheetOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newListOpen, setNewListOpen] = useState(false)
  const sheetOpen = bulkSheet !== null || statusSheetOpen || newListOpen
  // シートが開いている間、地図の器の下端をシートの上端で終える(Google の帰属表示を隠さない)。
  const mapOuterRef = useRef<HTMLDivElement>(null)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const sheetWrapperRef = useRef<HTMLDivElement>(null)
  useListSheetCover(sheetOpen, mapBoxRef, mapOuterRef, sheetWrapperRef)

  const [toast, setToast] = useState<{ nonce: number; variant: ScreenToastVariant } | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const toastExitTimerRef = useRef<number | null>(null)
  const showToast = useCallback((variant: ScreenToastVariant) => {
    if (toastExitTimerRef.current !== null) {
      window.clearTimeout(toastExitTimerRef.current)
      toastExitTimerRef.current = null
    }
    setToast((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, variant }))
  }, [])
  const dismissToast = useCallback(() => {
    setToastVisible(false)
    if (toastExitTimerRef.current !== null) window.clearTimeout(toastExitTimerRef.current)
    toastExitTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastExitTimerRef.current = null
    }, TOAST_EXIT_MS)
  }, [])
  useEffect(() => {
    if (!toast) return
    const enterId = window.requestAnimationFrame(() => setToastVisible(true))
    const dismissId = window.setTimeout(dismissToast, TOAST_VISIBLE_MS)
    return () => {
      window.cancelAnimationFrame(enterId)
      window.clearTimeout(dismissId)
    }
  }, [toast, dismissToast])
  useEffect(
    () => () => {
      if (toastExitTimerRef.current !== null) window.clearTimeout(toastExitTimerRef.current)
    },
    [],
  )
  // 解決済みの表示値はタブをまたいで画面が持つ。行ローカルに置くと、タブを戻すたびに行が
  // 再マウントして空へ戻り、キャッシュヒットでも一度ちらつく。
  const [displays, setDisplays] = useState<ReadonlyMap<string, PlaceDisplay>>(
    () => new Map(),
  )
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  // 発火済みの place_id。**1 行 1 回の発火と StrictMode の二重実行ガードを兼ねる** ——
  // details-cache は解決後にしかキャッシュへ書かないので、並走した 2 本はどちらもキャッシュを
  // 外して 2 回課金される(/map の placeFetchInFlightRef と同じ層で塞ぐ)。
  // 失敗しても消さない = 自動リトライしない(ネットワーク断では可視行が全部失敗するので、
  // リトライは日次 cap を二重に焼く)。
  const startedRef = useRef<Set<string>>(new Set())

  const markFailed = useCallback((googlePlaceId: string) => {
    setFailed((previous) => new Set(previous).add(googlePlaceId))
  }, [])

  const loadDisplay = useCallback(
    async (placesLibrary: google.maps.PlacesLibrary, googlePlaceId: string) => {
      try {
        // 一覧のマスクは店舗詳細(即時)と同じ(Pro 帯・spec §4.2)。取得口は details-cache に閉じる
        // (spec §4.3)—— 画面から Places SDK のフィールド取得を直接呼ばない。
        // 2026-11-25 に、国を見分けるため `addressComponents`(Essentials・帯は変わらない)を足した。一覧には札を置かず、
        // 店舗詳細が一覧と同じキャッシュの項目を使うために揃える(足さないと、一覧から詳細を開くたびに取り直す)。
        // 所有者の決定 2026-11-25・harema#219。
        const place = await getPlaceDetails(placesLibrary, googlePlaceId, [
          'displayName',
          'formattedAddress',
          'addressComponents',
        ])
        const displayName = place.displayName
        const formattedAddress = place.formattedAddress
        // 片方でも欠けた行は 2 行構造を組めない。空のまま残すと「取得中」と見分けが
        // つかなくなるので、失敗として扱う(確定文言を出す)。
        if (typeof displayName !== 'string' || typeof formattedAddress !== 'string') {
          markFailed(googlePlaceId)
          return
        }
        setDisplays((previous) =>
          new Map(previous).set(googlePlaceId, { displayName, formattedAddress }),
        )
      } catch {
        // 握り潰しではない —— 失敗はその行の確定文言として画面に出る。Places の応答も
        // 失敗も log に残さない(spec §4.1 の趣旨)。
        markFailed(googlePlaceId)
      }
    },
    [markFailed],
  )

  // Maps JS 本体が読み込めなかった(面 10・WP-10 S10)。可視判定待ちの行は交差観測が二度と
  // 発火しないのでスケルトンに固まる —— 描画時に導出する値として全行を既存の失敗行表示
  // (承認済みの面。新しい面を作らない)へ収束させる(effect 内 setState を避ける
  // = react-hooks/set-state-in-effect)。
  const mapsFailed = apiStatus === APILoadingStatus.FAILED

  /**
   * ライブラリが未ロードのあいだは null を返し、行に監視を始めさせない。解決した時点で
   * 参照が変わり、行の effect が張り直されて交差判定がやり直される —— 取りこぼしも
   * 発火待ちキューも要らなくなる(observe した瞬間に、既に交差している要素へ 1 回届く)。
   */
  const handleRowVisible = useMemo(() => {
    if (places === null) return null
    return (googlePlaceId: string) => {
      if (startedRef.current.has(googlePlaceId)) return
      startedRef.current.add(googlePlaceId)
      void loadDisplay(places, googlePlaceId)
    }
  }, [places, loadDisplay])

  const selectStatus = useCallback(
    (next: SavedPlaceStatus) => {
    setStatus(next)
    setSelectedId(null)
    setCheckedIds([])
    // 新しいタブは先頭から見せる(前のタブで動かした位置のままだと 1 番からの札とピンが食い違い、
    // 先頭の行も取得されない)。即時に戻す(滑らかだと途中の行が交差して取得が増える)。
    listRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    // URL だけを追随させる(サーバを再実行しない = 解決済みの表示値が生き残る)。
    // pushState にしないのは、タブを触るたびに履歴が積まれて戻るが効きにくくなるため。
    // 絞り(`list`)は落とさない。
    window.history.replaceState(null, '', searchWithList(`?status=${next}`, activeListId))
  },
    [activeListId],
  )

  const clearSelection = useCallback(() => setSelectedId(null), [])

  // 札を替えたら、タブを替えた時と同じ扱い(選びを外す・一覧を先頭へ即時に戻す)。地図の範囲は markers の変化で合わせ直る。
  const selectList = useCallback((next: string | null) => {
    setSelectedListId(next)
    setSelectedId(null)
    setCheckedIds([])
    listRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const endSelecting = useCallback(() => {
    setSelecting(false)
    setCheckedIds([])
  }, [])

  // 一括でリストへ入れる・外す。結果は知らせで伝える。成功したら選びが終わる(失敗では選びを残す)。
  const applyBulk = useCallback(
    async (op: 'add' | 'remove', listId: string, savedPlaceIds: string[]) => {
      setBusy(true)
      try {
        const result = await changeListPlaces({ listId, savedPlaceIds, op })
        if (result.ok) {
          showToast(op === 'add' ? 'list-added' : 'list-removed')
          endSelecting()
          return
        }
        // ログインが切れていたら、保存のシート・リストの編集と同じくログインへ送る(待っても直らない)。
        if (result.reason === 'unauthenticated') {
          router.replace('/login')
          return
        }
      } catch {
        // 握り潰しではない。失敗の知らせを出す。
      } finally {
        setBusy(false)
      }
      showToast('list-error')
    },
    [showToast, endSelecting, router],
  )

  // 一括の状態の変更。今のタブの状態(`status`)を `from` として送る。結果は知らせで伝える。成功したら選びが終わる(失敗では選びを残す)。
  const changeStatus = useCallback(
    async (to: SavedPlaceStatus) => {
      setBusy(true)
      try {
        const result = await bulkChangeStatus({ savedPlaceIds: checkedIds, from: status, to })
        if (result.ok) {
          showToast('save-updated')
          endSelecting()
          return
        }
        if (result.reason === 'unauthenticated') {
          router.replace('/login')
          return
        }
      } catch {
        // 握り潰しではない。失敗の知らせを出す。
      } finally {
        setBusy(false)
      }
      showToast('bulk-error')
    },
    [checkedIds, status, showToast, endSelecting, router],
  )

  // 一括の削除。確認(BulkDeleteDialog)の「削除する」から。成功しても知らせは出さない(店が一覧から消える)。確認は結果の後に必ず閉じる。
  const deleteChecked = useCallback(async () => {
    setBusy(true)
    try {
      const result = await bulkDeleteSavedPlaces({ savedPlaceIds: checkedIds })
      if (result.ok) {
        endSelecting()
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
    } catch {
      // 握り潰しではない。失敗の知らせを出す。
    } finally {
      setBusy(false)
      setDeleteConfirmOpen(false)
    }
    showToast('bulk-error')
  }, [checkedIds, showToast, endSelecting, router])

  // ピンを押したら、一覧の器をその行まで即時に動かす。滑らかに動かすと途中のフレームで間の行が
  // 領域を通り、通った行がすべて取得される(課金が増える)。Places は呼ばない。
  const selectRow = useCallback((id: string) => {
    setSelectedId(id)
    const list = listRef.current
    const rowElement = list?.querySelector<HTMLElement>(`[data-saved-row-id="${CSS.escape(id)}"]`)
    if (!list || !rowElement) return
    // +1px: offsetTop ちょうどだと、1 つ上の行の下端が領域の上端に接し、IntersectionObserver は
    // 接しているだけ(交わりの面積 0)でも交差と数えるので、見えていない上の行まで取得される
    // (Mac の確かめ B4 で 7 行目が 1 件多く取れた)。1px ずらして接しないようにする。
    list.scrollTo({ top: rowElement.offsetTop + 1, behavior: 'instant' })
  }, [])

  // 絞った後の行。行・ピンとも同じ絞りを通る(番号は絞った後の並びの 1 始まり)。
  const filteredRows = useMemo(() => filterByList(rows, activeListId), [rows, activeListId])
  const statusRows = rows.filter((row) => row.status === status)
  const visibleRows = filteredRows.filter((row) => row.status === status)
  // タブの札の数。すべてならサーバの数、絞っている時は行・ピンと同じ絞りを通した数。
  const tabCounts = countsForTabs(counts, rows, activeListId)
  // 「選ぶ」を押せるのは、選んでいる間か、見えている行がある時だけ(0 件の絞り・空のタブでは押せない)。
  const canSelect = selectEntryEnabled(visibleRows.length, selecting)

  return (
    <FullViewportShell>
      <header
        style={{
          flex: 'none',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
        }}
      >
        <Link
          href={pathWithList('/map', activeListId)}
          aria-label={t('backToMap')}
          style={{
            flex: 'none',
            width: 36,
            height: 36,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-1)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span
          style={{
            ...heading(18),
            color: 'var(--fg-1)',
          }}
        >
          {selecting ? lt('selectedCount', { count: checkedIds.length }) : t('title')}
        </span>
        {listsOpen && (
          <button
            type="button"
            data-testid="list-select"
            disabled={!canSelect}
            onClick={() => (selecting ? endSelecting() : setSelecting(true))}
            style={{
              ...META,
              marginLeft: 'auto',
              flex: 'none',
              height: 36,
              boxSizing: 'border-box',
              padding: '0 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              background: 'var(--surface)',
              color: 'var(--fg-1)',
              cursor: 'pointer',
              // 押せない時の値は、同じ画面の一括の帯のボタン(bulk-bar.tsx)と同じ。
              ...(canSelect ? {} : { opacity: 0.5, cursor: 'default' }),
            }}
          >
            {selecting ? common('cancel') : lt('select')}
          </button>
        )}
      </header>

      <div
        role="tablist"
        style={{
          flex: 'none',
          display: 'flex',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {SAVED_PLACE_STATUSES.map((tabStatus) => {
          const active = tabStatus === status
          return (
            <button
              key={tabStatus}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectStatus(tabStatus)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '13px 2px',
                marginBottom: -1,
                background: 'transparent',
                border: 0,
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  ...META,
                  fontWeight: active ? 700 : undefined,
                  color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                }}
              >
                {statusNames(tabStatus)}
              </span>
              <span
                style={{
                  ...NUM,
                  fontSize: 11,
                  lineHeight: '16px',
                  color: 'var(--fg-2)',
                  background: 'var(--bg-sunken)',
                  borderRadius: 'var(--radius-chip)',
                  padding: '1px 6px',
                }}
              >
                {tabCounts[tabStatus]}
              </span>
            </button>
          )
        })}
      </div>

      {/* リストの札の段(高さ 44)。絞るだけ(作る・変える・消すは「リスト」の画面)。リストが 0 個でも出す。トーストはこの段の下端 + 9px。 */}
      {listsOpen && (
        <div style={{ position: 'relative', flex: 'none' }}>
          <ListChips
            variant="saved"
            lists={lists}
            selectedId={activeListId}
            onSelect={selectList}
          />
          {toast && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 9,
                zIndex: 16,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ pointerEvents: 'auto' }}>
                <MapToast variant={toast.variant} visible={toastVisible} onDismiss={dismissToast} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 地図は一覧と一緒にスクロールしない。残りの高さは地図が取り、一覧の領域は固定する。
          中の絶対配置の箱(mapBoxRef)の下端を、シートが開いている間だけ縮める。 */}
      <div
        ref={mapOuterRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div ref={mapBoxRef} style={{ position: 'absolute', inset: 0 }}>
          <SavedListMap
            rows={filteredRows}
            status={status}
            selectedId={selectedId}
            onSelect={selectRow}
            onClear={clearSelection}
          />
        </div>
      </div>

      <div
        ref={listRef}
        style={{
          flex: 'none',
          position: 'relative',
          height: listRegionHeight(LIST_VISIBLE_ROWS),
          overflowY: 'auto',
          padding: '0 20px',
          ...(visibleRows.length === 0
            ? { display: 'flex', alignItems: 'center', justifyContent: 'center' }
            : null),
        }}
      >
        {visibleRows.length === 0 ? (
          <span
            style={{
              ...BODY,
              color: 'var(--fg-2)',
            }}
          >
            {statusRows.length === 0 ? t('empty') : lt('empty')}
          </span>
        ) : (
          <>
            {visibleRows.map((row, index) => (
              <SavedRow
                key={row.id}
                id={row.id}
                number={index + 1}
                selected={row.id === selectedId}
                googlePlaceId={row.googlePlaceId}
                display={displays.get(row.googlePlaceId)}
                failed={mapsFailed || failed.has(row.googlePlaceId)}
                onVisible={handleRowVisible}
                icon={pinIconFor(row.listIds, lists, activeListId)}
                showIconSlot={listsOpen && lists.length > 0}
                selecting={selecting}
                checked={checkedIds.includes(row.id)}
                onToggle={() => {
                  // 上限(100 件)まで選んだ後に、まだ選んでいない行を押した時は、選びを変えず知らせを出す。
                  if (selectionLimitHit(checkedIds, row.id)) {
                    showToast('bulk-limit')
                    return
                  }
                  setCheckedIds((current) => toggleSelection(current, row.id))
                }}
              />
            ))}
            <GoogleAttribution />
          </>
        )}
      </div>

      {listsOpen && selecting && (
        <BulkBar
          rows={bulkBarRows(activeListId)}
          selectedCount={checkedIds.length}
          busy={busy}
          onAdd={() => setBulkSheet('add')}
          onRemove={() => {
            if (activeListId !== null) void applyBulk('remove', activeListId, checkedIds)
          }}
          onStatus={() => setStatusSheetOpen(true)}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
      )}

      {/* リストのシート(一括)・状態を選ぶ段と、名前とアイコンのシート・一括の削除の確認。スクリム 20 / シート 21、名前とアイコン・削除の確認は 30 / 31(上に重なる)。 */}
      <div ref={sheetWrapperRef} style={{ display: 'contents' }}>
        {listsOpen && bulkSheet !== null && (
          <ListSheet
            zBase={20}
            mode="apply"
            title={lt('pickAddTitle')}
            lists={listsForBulkAdd(lists, activeListId)}
            onApply={(list) => void applyBulk('add', list.id, checkedIds)}
            onNew={() => setNewListOpen(true)}
            onClosed={() => setBulkSheet(null)}
          />
        )}
        {listsOpen && statusSheetOpen && (
          <StatusPickSheet
            zBase={20}
            current={status}
            onPick={(to) => void changeStatus(to)}
            onClosed={() => setStatusSheetOpen(false)}
          />
        )}
        {listsOpen && newListOpen && (
          <ListEditorSheet
            zBase={30}
            onCreated={(created) => {
              // 作ったリストに、選んだ店をそのまま入れる。入れるリストの段も閉じる。
              setBulkSheet(null)
              void applyBulk('add', created.id, checkedIds)
            }}
            onClosed={() => setNewListOpen(false)}
          />
        )}
        {listsOpen && deleteConfirmOpen && (
          <BulkDeleteDialog
            zBase={30}
            count={checkedIds.length}
            pending={busy}
            onCancel={() => setDeleteConfirmOpen(false)}
            onConfirm={() => void deleteChecked()}
          />
        )}
      </div>
    </FullViewportShell>
  )
}

type SavedRowProps = {
  id: string
  /** そのタブの並び(保存日の新しい順)の 1 始まりの番号。 */
  number: number
  selected: boolean
  googlePlaceId: string
  display: PlaceDisplay | undefined
  failed: boolean
  onVisible: ((googlePlaceId: string) => void) | null
  /** 行の左の絵(リストのアイコン)。絞っている時はそのリストの絵。 */
  icon: string | null
  /** リストを 1 つでも持つ人だけ、絵の枠(幅 16)を取る。持たない人の行は今のまま。 */
  showIconSlot: boolean
  /** 「選ぶ」の間。行を押すとチェックが付く(店舗詳細へは行かない)。 */
  selecting: boolean
  checked: boolean
  onToggle: () => void
}

/**
 * 1 行(design D-3)。**タップで詳細(④)へ直接遷移する**(WP-10・spec §6.3)。
 * `prefetch={false}` —— 一覧の可視行は既に個別に課金取得しており、先読みで RSC prefetch を
 * 足すと、見ていない行まで詳細ルートの取得を誘発しうる(F6)。
 *
 * 行高 70px は**取得中・解決・失敗のどの状態でも一致する**既定を崩さない —— `display:block` の
 * リンクで包むだけで、内側の padding / border / 行構造は変えない(`white-space:nowrap` も
 * `text-overflow:ellipsis` も足さない)。
 *
 * 画面に見えた行だけを取りに行く(ユーザー裁定 2026-08-12)。**先読みしない** ——
 * `rootMargin` を足すと、見ていない行まで課金する。
 */
function SavedRow({
  id,
  number,
  selected,
  googlePlaceId,
  display,
  failed,
  onVisible,
  icon,
  showIconSlot,
  selecting,
  checked,
  onToggle,
}: SavedRowProps) {
  const t = useTranslations('web.savedList')
  const elementRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const element = elementRef.current
    if (element === null || onVisible === null) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      // 初回交差で監視を外す(1 行 1 回)。スクロールで往復しても再発火しない。
      observer.disconnect()
      onVisible(googlePlaceId)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [googlePlaceId, onVisible])

  return (
    <Link
      ref={elementRef}
      href={`/places/${id}`}
      prefetch={false}
      data-saved-row-id={id}
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? checked : undefined}
      onClick={
        selecting
          ? (event) => {
              event.preventDefault()
              onToggle()
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        // 選んだ行は --bg-sunken の地(行の高さは 70px のまま・字の位置も動かさない)。
        ...(selected
          ? { background: 'var(--bg-sunken)', margin: '0 -20px', padding: `${ROW_PADDING_Y}px 20px` }
          : { padding: `${ROW_PADDING_Y}px 0` }),
        borderBottom: `${ROW_BORDER}px solid var(--border-subtle)`,
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          ...NUM,
          flex: 'none',
          width: 24,
          height: 24,
          borderRadius: 'var(--radius-chip)',
          // 選んだ行は地が --bg-sunken になるので、札は地の色(--bg)にして円を見せる。
          background: selected ? 'var(--bg)' : 'var(--bg-sunken)',
          fontSize: 12,
          lineHeight: '24px',
          textAlign: 'center',
          color: 'var(--fg-1)',
        }}
      >
        {number}
      </span>
      {showIconSlot && (
        <span
          aria-hidden="true"
          style={{ flex: 'none', width: 16, fontSize: 16, lineHeight: '24px', textAlign: 'center' }}
        >
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {display === undefined && !failed ? (
          <>
            <div
              style={{
                height: NAME_SLOT_HEIGHT,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div className="saved-skeleton-bar" style={{ width: '58%', height: '10px' }} />
            </div>
            <div
              style={{
                height: ADDRESS_SLOT_HEIGHT,
                marginTop: ADDRESS_GAP,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div className="saved-skeleton-bar" style={{ width: '42%', height: '8px' }} />
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                minHeight: NAME_SLOT_HEIGHT,
                ...BODY,
                lineHeight: `${NAME_SLOT_HEIGHT}px`,
                color: 'var(--fg-1)',
              }}
            >
              {display === undefined ? t('detailsUnavailable') : display.displayName}
            </div>
            <div
              style={{
                minHeight: ADDRESS_SLOT_HEIGHT,
                marginTop: ADDRESS_GAP,
                ...META,
                lineHeight: `${ADDRESS_SLOT_HEIGHT}px`,
                color: 'var(--fg-2)',
              }}
            >
              {display?.formattedAddress}
            </div>
          </>
        )}
      </div>
      {selecting && (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          style={{ flex: 'none', width: 20, height: 20, accentColor: 'var(--fg-1)', pointerEvents: 'none' }}
        />
      )}
    </Link>
  )
}
