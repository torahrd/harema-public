'use client'

import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SAVED_PLACE_STATUSES,
  type SavedPlaceStatus,
} from '@harema/shared/constants'
import { ja } from '@harema/shared/i18n'
import { FullViewportShell } from '@/app/full-viewport-shell'
import { clientEnv } from '@/env/client'
import { getPlaceDetails } from '@/lib/places/details-cache'
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
import {
  BACK_TO_MAP_LABEL,
  PLACE_DETAILS_UNAVAILABLE,
  SAVED_LIST_EMPTY,
  SAVED_LIST_TITLE,
} from './saved-list-copy'
import { SavedListMap } from './saved-list-map'
import type { PlaceDisplay, SavedListCounts, SavedListRow } from './types'
import { BODY, META, NUM, heading } from '../text-styles'

type SavedListScreenProps = {
  rows: SavedListRow[]
  counts: SavedListCounts
  initialStatus: SavedPlaceStatus
}

/**
 * 一覧の外殻。`useMapsLibrary('places')` は `<APIProvider>` の内側でしか解決しないので、
 * 中身を分けてここで包む。地図は `saved-list-map.tsx` に 1 つ。一覧を開くたび(詳細から
 * 戻るたびを含む)に Map loads が 1 回(タブを替えても作り直さない)。
 */
export function SavedListScreen({ rows, counts, initialStatus }: SavedListScreenProps) {
  return (
    <APIProvider apiKey={clientEnv.googleMapsApiKey} language="ja" region="JP">
      <SavedListView rows={rows} counts={counts} initialStatus={initialStatus} />
    </APIProvider>
  )
}

function SavedListView({ rows, counts, initialStatus }: SavedListScreenProps) {
  const places = useMapsLibrary('places')
  const apiStatus = useApiLoadingStatus()
  const [status, setStatus] = useState<SavedPlaceStatus>(initialStatus)
  // ピンを押して選んだ行。タブを替える・地図の何も無い所を押すと外れる。
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
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
        // 一覧のマスクはこの 2 つだけ(Pro 帯・spec §4.2)。取得口は details-cache に閉じる
        // (spec §4.3)—— 画面から Places SDK のフィールド取得を直接呼ばない。
        const place = await getPlaceDetails(placesLibrary, googlePlaceId, [
          'displayName',
          'formattedAddress',
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

  const selectStatus = useCallback((next: SavedPlaceStatus) => {
    setStatus(next)
    setSelectedId(null)
    // 新しいタブは先頭から見せる(前のタブで動かした位置のままだと 1 番からの札とピンが食い違い、
    // 先頭の行も取得されない)。即時に戻す(滑らかだと途中の行が交差して取得が増える)。
    listRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    // URL だけを追随させる(サーバを再実行しない = 解決済みの表示値が生き残る)。
    // pushState にしないのは、タブを触るたびに履歴が積まれて戻るが効きにくくなるため。
    window.history.replaceState(null, '', `?status=${next}`)
  }, [])

  const clearSelection = useCallback(() => setSelectedId(null), [])

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

  const visibleRows = rows.filter((row) => row.status === status)

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
          href="/map"
          aria-label={BACK_TO_MAP_LABEL}
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
          {SAVED_LIST_TITLE}
        </span>
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
                {ja.savedPlaceStatus[tabStatus]}
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
                {counts[tabStatus]}
              </span>
            </button>
          )
        })}
      </div>

      {/* 地図は一覧と一緒にスクロールしない。残りの高さは地図が取り、一覧の領域は固定する。 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <SavedListMap
          rows={rows}
          status={status}
          selectedId={selectedId}
          onSelect={selectRow}
          onClear={clearSelection}
        />
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
            {SAVED_LIST_EMPTY}
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
              />
            ))}
            <GoogleAttribution />
          </>
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
function SavedRow({ id, number, selected, googlePlaceId, display, failed, onVisible }: SavedRowProps) {
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
              {display === undefined ? PLACE_DETAILS_UNAVAILABLE : display.displayName}
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
    </Link>
  )
}
