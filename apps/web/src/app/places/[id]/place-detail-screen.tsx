'use client'

import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedPlaceStatus } from '@harema/shared/constants'
import { ja } from '@harema/shared/i18n'
import { FullViewportShell } from '@/app/full-viewport-shell'
import { MapToast } from '@/app/map/map-toast'
import { SaveSheet } from '@/app/map/save-sheet'
import type { MapLaunchContext } from '@/app/map/types'
import { GoogleAttribution } from '@/app/saved/google-attribution'
import type { PlaceDisplay } from '@/app/saved/types'
import { clientEnv } from '@/env/client'
import { getPlaceDetails } from '@/lib/places/details-cache'
import {
  DETAIL_BACK_LABEL,
  DETAIL_EDIT_ARROW,
  DETAIL_EDIT_LABEL,
  DETAIL_ENTERPRISE_FETCH_FAIL,
  DETAIL_FETCH_FAIL_LINE_1,
  DETAIL_FETCH_FAIL_LINE_2,
  DETAIL_MAPS_LABEL,
  DETAIL_MEMO_CAPTION,
  DETAIL_PANEL_HOURS_CAPTION,
  DETAIL_PANEL_MISSING,
  DETAIL_PANEL_PHONE_CAPTION,
  DETAIL_PANEL_WEBSITE_CAPTION,
  DETAIL_ROW_LABEL,
  DETAIL_SOURCE_CAPTION,
  DETAIL_STATUS_CAPTION,
  EXTERNAL_ARROW,
} from './place-detail-copy'
import { BODY, LABEL_JA, META, NUM, heading } from '../../text-styles'

/** 展開マスク(Enterprise SKU)で取れる 3 値。`weekdayDescriptions` は畳まず 1 要素 1 行で持つ。
 * サイト(website)は 2026-08-25 の人間裁定 C により WP-10 では持たなかったが、WP-10.5 で
 * 予約どおり復旧した(details-cache.ts の union へ戻し、下の展開マスクへ足した)。 */
type EnterpriseDetails = {
  weekdayDescriptions: string[] | null
  nationalPhoneNumber: string | null
  websiteURI: string | null
}

/** http(s) の値かどうか(C-S11。安全でないスキームをリンク化しない)。 */
function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/** Google マップ外部リンクの公式 URL 形式(`specification.md:238` の逐語形。Places 課金対象外)。 */
function googleMapsHref(displayName: string, googlePlaceId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&query_place_id=${googlePlaceId}`
}

/** サーバ(page.tsx)から渡す、この画面が要る値だけ(saved_places.id は渡さない —— このスライスの
 * 描画に使わないので、渡さないことで client の保有物を最小に保つ)。`location` は「編集する」が
 * 開く S1 シートの `MapLaunchContext` に渡すためだけに持つ(計画 §8.1)。DB へ書き戻さない。 */
export type PlaceDetailData = {
  status: SavedPlaceStatus
  memo: string | null
  sourceText: string | null
  sourceTitle: string | null
  googlePlaceId: string
  location: { lat: number; lng: number } | null
}

type PlaceDetailScreenProps = {
  data: PlaceDetailData
}

const CAPTION_STYLE: React.CSSProperties = LABEL_JA

/** 展開パネルの見出し(design `.sd-pcap`)。letter-spacing が .14em で `CAPTION_STYLE`(.16em)とは別値。 */
const PANEL_CAPTION_STYLE: React.CSSProperties = { ...LABEL_JA, marginBottom: 5 }

/** 展開パネルの「値が無い」表示(design `.sd-nil`)。 */
const PANEL_NIL_STYLE: React.CSSProperties = { ...META, color: 'var(--fg-muted)' }

const CHEVRON_PATH = 'M6 9l6 6 6-6'
const CHEVRON_OPEN_PATH = 'M18 15l-6-6-6 6'
const BACK_CHEVRON_PATH = 'M15 6l-6 6 6 6'

/** トースト退場アニメの尺。globals.css の `--dur-slow: 240ms` と一致させる(map-screen.tsx と同じ値。WP-10 S9)。 */
const TOAST_EXIT_MS = 240
/** トーストの自動表示時間(map-screen.tsx と同じ値)。 */
const TOAST_VISIBLE_MS = 4000

/**
 * 店舗詳細(④)の外殻。`useMapsLibrary('places')` は `<APIProvider>` の内側でしか解決しないので、
 * 一覧・地図と同じ形で中身を分けて包む。**地図コンポーネントそのものは描かない**(起動するのは
 * Places ライブラリの解決だけで、地図インスタンスの生成契機は無い)。
 */
export function PlaceDetailScreen({ data }: PlaceDetailScreenProps) {
  return (
    <APIProvider apiKey={clientEnv.googleMapsApiKey} language="ja" region="JP">
      <PlaceDetailView data={data} />
    </APIProvider>
  )
}

function PlaceDetailView({ data }: PlaceDetailScreenProps) {
  const places = useMapsLibrary('places')
  const apiStatus = useApiLoadingStatus()
  const [display, setDisplay] = useState<PlaceDisplay | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  // 1 マウントにつき 1 回だけ発火させるガード(StrictMode の二重実行対策。一覧・地図の
  // 同種のガードと同じ層)。
  const startedRef = useRef(false)

  // Maps JS 本体が読み込めなかった(面 10・WP-10 S10)。`places` は解決しないままなので下の
  // effect は一度も走らず、放っておくと店名・住所がスケルトンのまま固まる —— 描画時に導出する
  // 値として既存の失敗面(面 1b)へ収束させる(新しい面を作らない・effect 内 setState を避ける
  // = react-hooks/set-state-in-effect)。
  const mapsFailed = apiStatus === APILoadingStatus.FAILED
  const effectiveFailed = failed || mapsFailed

  useEffect(() => {
    if (places === null) return
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        // 即時マスクはこの 2 つだけ(確定事項 2026-08-24。一覧の可視行キャッシュ済みマスクと
        // 揃う)。配列リテラルで直書きする(変数へ逃がすと静的に読めなくなる)。
        const place = await getPlaceDetails(places, data.googlePlaceId, [
          'displayName',
          'formattedAddress',
        ])
        if (cancelled) return
        const { displayName, formattedAddress } = place
        if (typeof displayName !== 'string' || typeof formattedAddress !== 'string') {
          setFailed(true)
          return
        }
        setDisplay({ displayName, formattedAddress })
      } catch {
        // 握り潰しではない —— 失敗はこの画面の確定文言として出る。自動リトライしない。
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [places, data.googlePlaceId])

  // 展開パネル(営業時間・電話・website)。Enterprise マスクは「詳細情報」を開いたときにだけ
  // 取りに行く(計画 §8 S4 / A2)。ガードは immediate mask と同じ層 —— 1 マウントにつき
  // 1 回しか `getPlaceDetails` を呼ばないので、折りたたみ → 再展開は TTL の内外を問わず
  // 追加リクエストを出さない(即時マスクより強い保証だが、A2 が要求する下限は満たす)。
  const [expanded, setExpanded] = useState(false)
  const [enterpriseData, setEnterpriseData] = useState<EnterpriseDetails | undefined>(undefined)
  const [enterpriseFailed, setEnterpriseFailed] = useState(false)
  const enterpriseStartedRef = useRef(false)
  // 折りたたみ中に届いた応答を捨てない(AD-D1 repair 2026-08-25)。以前はこの下の effect の
  // 依存配列に `expanded` を含めたまま cleanup で `cancelled` を true にしていた —— 折りたたみ
  // は `expanded` の変化そのものなので、唯一許される応答(enterpriseStartedRef が 2 回目の
  // リクエストを止める)を毎回そこで捨て、再展開してもガードにより再取得はされず、展開パネルは
  // 開き直しても一生スケルトンのまま固まっていた。ここでは「本当のアンマウント」だけを持つ ref
  // に切り替え、届いた応答は展開/折りたたみの状態に関わらず state へ反映する(リクエスト回数は
  // 変わらない —— enterpriseStartedRef のガードは従来どおり 1 マウント 1 回のまま)。
  // dev の StrictMode はマウント時に setup → cleanup → setup を同じ fiber へ再生する
  // (ref はその再生をまたいで生き残る)。cleanup だけで true にすると、この再生の 1 回目の
  // cleanup で true になったまま 2 回目の setup で戻されず、コンポーネントは実際にはまだ
  // マウントされているのに「アンマウント済み」を意味し続け、以後届く応答をすべて捨てて
  // しまう(CR-DIFF-002 repair 2026-08-25)。setup 側で毎回 false に戻すことで、この ref が
  // 表す意味を「本当の最後の unmount」だけに保つ。
  const enterpriseUnmountedRef = useRef(false)
  useEffect(() => {
    enterpriseUnmountedRef.current = false
    return () => {
      enterpriseUnmountedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!expanded) return
    if (places === null) return
    if (enterpriseStartedRef.current) return
    enterpriseStartedRef.current = true
    void (async () => {
      try {
        // 展開マスクはこの 3 つだけ(2026-08-25 人間裁定 C により WP-10 では `specification.md:120`
        // の 3 項目から website を外し 2 項目へ減らしていたが、WP-10.5 で予約どおり 3 項目へ
        // 復旧した。配列リテラルで直書きする)。
        const place = await getPlaceDetails(places, data.googlePlaceId, [
          'regularOpeningHours',
          'nationalPhoneNumber',
          'websiteURI',
        ])
        if (enterpriseUnmountedRef.current) return
        setEnterpriseData({
          weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions ?? null,
          nationalPhoneNumber: place.nationalPhoneNumber ?? null,
          websiteURI: place.websiteURI ?? null,
        })
      } catch {
        // 新しい面を作らない —— 上部の固定 1 文だけを出す。値欄の「—」とは混同させない。
        // 自動リトライしない。
        if (!enterpriseUnmountedRef.current) setEnterpriseFailed(true)
      }
    })()
  }, [expanded, places, data.googlePlaceId])

  const hasMemo = Boolean(data.memo && data.memo.length > 0)
  // 出典の在否は sourceText と sourceTitle のどちらかがあれば真(CR-DIFF-003 repair
  // 2026-08-25)。source_text は「自由記述または URL」(schema-contract.md:146)で、自由記述の
  // 保存は sourceTitle を空のまま残す(save-sheet.tsx の maybeFetchTitle は URL でなければ
  // 何もしない)——sourceTitle だけを見ると、ユーザーが自分で入力した出典が無言で消える。
  // 両方空のときだけ節ごと出さない(design 面 2)。
  const hasSource = Boolean(
    (data.sourceText && data.sourceText.length > 0) ||
      (data.sourceTitle && data.sourceTitle.length > 0),
  )
  const sourceLabel =
    data.sourceTitle && data.sourceTitle.length > 0 ? data.sourceTitle : data.sourceText
  const statusLabel = ja.savedPlaceStatus[data.status]
  const badge = badgeAppearance(data.status)

  // 「編集する」が開く先(design D-1 注記「編集は S1 シートへ」)。S1(save-sheet.tsx)は
  // googlePlaceId から自分でサーバへ問い合わせて新規/編集を判定し、編集なら状態・メモ・出典を
  // 自分で初期値として入れる(A3)——このスライスは MapLaunchContext を渡して起こすだけで、
  // 事前入力そのものは S1 の既存の責務(save-sheet.tsx:176-210)に委ねる。
  const [editOpen, setEditOpen] = useState(false)
  const editContext: MapLaunchContext = {
    googlePlaceId: data.googlePlaceId,
    displayName: display?.displayName ?? '',
    formattedAddress: display?.formattedAddress ?? '',
    location: data.location,
  }

  const router = useRouter()

  // 更新後トースト(design 面 7)。既存 map-toast.tsx を改変せず再利用する(C-D6・WP-10 S9)。
  // 削除にはトーストを出さない(確定事項 §12-⑧-4)—— /saved へ遷移するので通知の必要がない。
  const [updateToastShown, setUpdateToastShown] = useState(false)
  const [updateToastVisible, setUpdateToastVisible] = useState(false)
  const updateToastExitTimerRef = useRef<number | null>(null)

  const dismissUpdateToast = useCallback(() => {
    setUpdateToastVisible(false)
    if (updateToastExitTimerRef.current !== null) {
      window.clearTimeout(updateToastExitTimerRef.current)
    }
    updateToastExitTimerRef.current = window.setTimeout(() => {
      setUpdateToastShown(false)
      updateToastExitTimerRef.current = null
    }, TOAST_EXIT_MS)
  }, [])

  useEffect(() => {
    if (!updateToastShown) return
    const enterId = window.requestAnimationFrame(() => setUpdateToastVisible(true))
    const dismissId = window.setTimeout(dismissUpdateToast, TOAST_VISIBLE_MS)
    return () => {
      window.cancelAnimationFrame(enterId)
      window.clearTimeout(dismissId)
    }
  }, [updateToastShown, dismissUpdateToast])

  useEffect(() => {
    return () => {
      if (updateToastExitTimerRef.current !== null) {
        window.clearTimeout(updateToastExitTimerRef.current)
      }
    }
  }, [])

  // S1(保存/編集シート)の退場後に呼ばれる(save-sheet.tsx)。更新は画面を再取得して
  // (server component の再実行)トーストを出す。`created` はこの画面の起動条件上ここでは
  // 起こらないが、型は満たす。
  //
  // AD-N1 是正(WP-10-irregular-ad-n1-2026-08-26 §3.3)以降、削除の成功はサーバ側
  // `redirect('/saved')`(save-actions.ts の `deleteSavedPlaceFromDetail`、下の
  // `<SaveSheet deleteRedirectsToSaved>` 経由)が先に発火するため、この `'deleted'` 分岐は
  // 実務上もう到達しない。それでも残す(裁定 IRR-04・本計画の決定として固定)—— (1) `handleSaved`
  // の型が `'deleted'` を含む契約である以上その分岐を欠くと不能な組合せを暗黙に作ることになる、
  // (2) 万一 `SaveSheet` 側の配線が将来変わっても、ここが安全側(/saved へ倒す)のまま残って
  // ほしい、(3) 消しても得るものが無い(無コストの安全網)。
  const handleSaved = (mode: 'created' | 'updated' | 'deleted') => {
    setEditOpen(false)
    if (mode === 'deleted') {
      router.replace('/saved')
      return
    }
    router.refresh()
    setUpdateToastVisible(false)
    setUpdateToastShown(true)
  }

  return (
    <FullViewportShell>
      <header
        style={{
          flex: 'none',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
        }}
      >
        <Link
          href="/saved"
          aria-label={DETAIL_BACK_LABEL}
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
            <path d={BACK_CHEVRON_PATH} />
          </svg>
        </Link>
      </header>

      {/* 更新後トースト(design 面 7)。戻る帯の中(top:49px)・既存 map-toast.tsx を再利用
          (C-D6)。位置のみこの画面が持つ(map-toast.tsx 自身は位置を持たない)。 */}
      {updateToastShown && (
        <div
          style={{
            position: 'absolute',
            top: 49,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 16,
          }}
        >
          <MapToast
            variant="save-updated"
            visible={updateToastVisible}
            onDismiss={dismissUpdateToast}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 15,
            padding: '10px 20px 20px',
          }}
        >
          {display === undefined && !effectiveFailed ? (
            <div>
              <div style={{ height: 30, display: 'flex', alignItems: 'center' }}>
                <div className="saved-skeleton-bar" style={{ width: '62%', height: 15 }} />
              </div>
              <div
                style={{
                  height: 18,
                  marginTop: 5,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <div className="saved-skeleton-bar" style={{ width: '44%', height: 9 }} />
              </div>
            </div>
          ) : display === undefined ? (
            <div>
              <div
                style={{
                  ...BODY,
                  color: 'var(--fg-2)',
                }}
              >
                {DETAIL_FETCH_FAIL_LINE_1.map((part) => (
                  <span key={part} style={{ display: 'block' }}>
                    {part}
                  </span>
                ))}
              </div>
              <div
                style={{
                  ...META,
                  color: 'var(--fg-whisper)',
                  marginTop: 5,
                }}
              >
                {DETAIL_FETCH_FAIL_LINE_2}
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  ...heading(24),
                  color: 'var(--fg-1)',
                }}
              >
                {display.displayName}
              </div>
              <div
                style={{
                  ...META,
                  color: 'var(--fg-2)',
                  marginTop: 5,
                }}
              >
                {display.formattedAddress}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={CAPTION_STYLE}>{DETAIL_STATUS_CAPTION}</span>
            <span
              className={badge.badgeClassName}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                border: `1px solid ${badge.borderColor}`,
                borderRadius: 'var(--radius-chip)',
                padding: '5px 12px',
              }}
            >
              <span
                className={badge.dotClassName}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: badge.dotColor,
                }}
              />
              <span
                style={{
                  ...META,
                  color: badge.textColor,
                }}
              >
                {statusLabel}
              </span>
            </span>
          </div>

          {hasMemo && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 15 }}>
              <div style={{ ...CAPTION_STYLE, marginBottom: 7 }}>{DETAIL_MEMO_CAPTION}</div>
              <div
                style={{
                  ...BODY,
                  color: 'var(--fg-1)',
                }}
              >
                {data.memo}
              </div>
            </div>
          )}

          {hasSource && (
            <div>
              <div style={{ ...CAPTION_STYLE, marginBottom: 7 }}>{DETAIL_SOURCE_CAPTION}</div>
              {/* source_text は「自由記述または URL」(schema-contract.md:146)なので、http(s)
                  のときだけリンク化する(C-S11)。矢印はリンク化できたときだけ添える —— 外へ
                  遷移しない文字列に「外部へ開く」の記号を付けない。 */}
              {data.sourceText && isHttpUrl(data.sourceText) ? (
                <a
                  href={data.sourceText}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    ...BODY,
                    color: 'var(--fg-1)',
                  }}
                >
                  {sourceLabel}
                  {' '}
                  {EXTERNAL_ARROW}
                </a>
              ) : (
                <span
                  style={{
                    display: 'block',
                    ...BODY,
                    color: 'var(--fg-1)',
                  }}
                >
                  {sourceLabel}
                </span>
              )}
            </div>
          )}

          {/* 展開(営業時間・電話・website。design 面 3/4/5/9・計画 §8 S4)。押すたびに開閉するが、
              実際の取得は 1 マウントにつき 1 回だけ(上の effect のガード)。ライブラリ不在
              (未解決・読み込み失敗のいずれも)は disabled にし、追加リクエストを出させない
              (確定事項 2026-08-24。造形の導出は handoff `:65-74` —— fg-muted + opacity .55、
              毛細線・padding・行の高さは変えず、シェブロンは幾何を保って残す = U4 の既定)。
              サイト(website)は 2026-08-25 の人間裁定 C により WP-10 では一時的に持たず ——
              パネルの見出しを design 承認済み面 3/4/5/9 の 3 つから 2 つへ減らしていた
              (器の形不変を前提にする裁定だったため design 原本の造形 byte は不変のまま)。
              WP-10.5 で予約どおり復旧し、見出しは design の造形どおり 3 つに戻った。 */}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            disabled={places === null}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'transparent',
              border: 0,
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: expanded ? 0 : '1px solid var(--border-subtle)',
              padding: expanded ? '15px 0 4px' : '15px 0',
              ...BODY,
              color: places === null ? 'var(--fg-muted)' : 'var(--fg-1)',
              cursor: places === null ? 'default' : 'pointer',
              textAlign: 'left',
              opacity: places === null ? 0.55 : 1,
            }}
          >
            <span>{DETAIL_ROW_LABEL}</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={
                places === null
                  ? 'var(--fg-muted)'
                  : expanded
                    ? 'var(--accent)'
                    : 'var(--fg-2)'
              }
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={expanded ? CHEVRON_OPEN_PATH : CHEVRON_PATH} />
            </svg>
          </button>

          {expanded &&
            (enterpriseFailed ? (
              // 新しい面を作らない —— 既存の上部一時エラー型(面 1b の DETAIL_FETCH_FAIL_LINE_1
              // と同じ型)を再利用する 1 文だけ(確定事項 2026-08-24。design にコマは無い =
              // handoff U5)。値欄の DETAIL_PANEL_MISSING(「—」)とは別の意味。自動リトライしない。
              <div
                style={{
                  ...BODY,
                  color: 'var(--fg-2)',
                }}
              >
                {DETAIL_ENTERPRISE_FETCH_FAIL}
              </div>
            ) : enterpriseData === undefined ? (
              // 取得中(design 面 5)。見出しは先に出し、値の位置だけ帯にする。
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div>
                  <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_HOURS_CAPTION}</div>
                  <div className="saved-skeleton-bar" style={{ width: '66%', height: 9 }} />
                  <div
                    className="saved-skeleton-bar"
                    style={{ width: '34%', height: 9, marginTop: 6 }}
                  />
                </div>
                <div>
                  <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_PHONE_CAPTION}</div>
                  <div className="saved-skeleton-bar" style={{ width: '44%', height: 9 }} />
                </div>
                <div>
                  <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_WEBSITE_CAPTION}</div>
                  <div className="saved-skeleton-bar" style={{ width: '72%', height: 9 }} />
                </div>
              </div>
            ) : (
              // 届いた(design 面 3/4/5/9。裁定 C は WP-10 で見出しを一時的に 2 つへ減らして
              // いたが、WP-10.5 で予約どおり復旧し、上の造形決定注記のとおり 3 つに戻った)。
              // 器の形は変えない —— 3 見出しは常に出し、無い値は DETAIL_PANEL_MISSING。
              // 営業時間は weekdayDescriptions を順序・文言不変で 1 要素 1 行のまま出す
              // (整形器を書かない・曜日を畳まない。確定事項 2026-08-24)。
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div>
                  <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_HOURS_CAPTION}</div>
                  {enterpriseData.weekdayDescriptions &&
                  enterpriseData.weekdayDescriptions.length > 0 ? (
                    <div
                      style={{
                        ...META,
                        color: 'var(--fg-1)',
                      }}
                    >
                      {enterpriseData.weekdayDescriptions.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <div style={PANEL_NIL_STYLE}>{DETAIL_PANEL_MISSING}</div>
                  )}
                </div>
                <div>
                  <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_PHONE_CAPTION}</div>
                  {enterpriseData.nationalPhoneNumber ? (
                    <div style={{ ...NUM, fontSize: 13, lineHeight: '20px', color: 'var(--fg-1)' }}>
                      {enterpriseData.nationalPhoneNumber}
                    </div>
                  ) : (
                    <div style={PANEL_NIL_STYLE}>{DETAIL_PANEL_MISSING}</div>
                  )}
                </div>
                <div>
                  <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_WEBSITE_CAPTION}</div>
                  {/* 長い URL は折り返さず末尾省略する(人間裁定 2026-08-28)。<a> をインライン
                      のまま置くと nowrap / overflow / text-overflow が効かない(第 5 巡裁定が
                      CSS 仕様から確定)ので、既存の出典リンク(:504-518)と同じ display:'block'
                      イディオムに載せる。href は取得値そのまま(素通し・再構成しない)。 */}
                  {enterpriseData.websiteURI && isHttpUrl(enterpriseData.websiteURI) ? (
                    <a
                      href={enterpriseData.websiteURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        ...META,
                        color: 'var(--fg-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {enterpriseData.websiteURI}
                      {' '}
                      {EXTERNAL_ARROW}
                    </a>
                  ) : (
                    <div style={PANEL_NIL_STYLE}>{DETAIL_PANEL_MISSING}</div>
                  )}
                </div>
              </div>
            ))}

          {/* 編集シートを開く(design D-1 注記「編集は S1 シートへ」・計画 §8.1・A3)。ナビゲーション
              ではなく、この画面の上に S1(save-sheet.tsx)を編集状態で重ねる。 */}
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn-hairline"
              onClick={() => setEditOpen(true)}
            >
              {DETAIL_EDIT_LABEL}
              <span className="arrow">{DETAIL_EDIT_ARROW}</span>
            </button>
          </div>

          {/* 公式 URL 形式(`specification.md:238`)で安全属性つきのリンクにする(C-S11)。
              取得中は待ちの見た目(押せない)、取得失敗(店名・住所ごと取れない)では出さない。 */}
          {display ? (
            <a
              className="btn"
              href={googleMapsHref(display.displayName, data.googlePlaceId)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: '100%',
                justifyContent: 'center',
                boxSizing: 'border-box',
                textDecoration: 'none',
              }}
            >
              {DETAIL_MAPS_LABEL} <span>{EXTERNAL_ARROW}</span>
            </a>
          ) : !effectiveFailed ? (
            <div
              style={{
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-2)',
                padding: '10px 16px',
                fontFamily: 'var(--ff-sans)',
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 500,
                letterSpacing: '0.02em',
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-control)',
                color: 'var(--fg-muted)',
                opacity: 0.55,
              }}
            >
              {DETAIL_MAPS_LABEL}
            </div>
          ) : null}

          <GoogleAttribution />
        </div>
      </div>

      {/* S1(保存/編集シート)。地図側(map-screen.tsx)と同じスクリム 20 / シート 21 の重なり
          (save-sheet.tsx 自身が絶対配置するので、この外殻の position: fixed が包含ブロックになる)。 */}
      {editOpen && (
        <SaveSheet
          context={editContext}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
          deleteRedirectsToSaved
        />
      )}
    </FullViewportShell>
  )
}

type BadgeAppearance = {
  borderColor: string
  dotColor: string
  textColor: string
  badgeClassName?: string
  dotClassName?: string
}

/**
 * 状態バッジの色分岐(design 面 8a / 8b)。3 状態ラベルの文字列そのものはここに書かない
 * (呼び出し側が辞書から取った値をそのまま出す。C-S7)。DB enum のキー名で場合分けする。
 *
 * - `want_to_go` だけ light/dark で別トークン(--brand / --brand-soft)を当てる裁定のため、
 *   媒体クエリを要する 2 クラス(globals.css 末尾追記)を返す。
 * - `no_thanks` は既存トークン(--border-strong / --fg-muted / --fg-2)がモードで自己解決する。
 * - それ以外(既定 = `visit_again`)は両モード共通の --accent。
 */
function badgeAppearance(status: SavedPlaceStatus): BadgeAppearance {
  if (status === 'want_to_go') {
    // インラインの border / background は「カスタムプロパティの参照」だけを持つ
    // (色そのものは持たない)。実際の light/dark 切り替えはクラス側の @media が
    // --place-detail-badge-want-* を書き換えて行う(AD-D3 repair 2026-08-25。
    // globals.css 側のコメントを参照 —— 色リテラルをインラインへ直書きすると
    // 同名の非 !important ルールがどれも勝てない)。
    return {
      borderColor: 'var(--place-detail-badge-want-border)',
      dotColor: 'var(--place-detail-badge-want-dot)',
      textColor: 'var(--fg-1)',
      badgeClassName: 'place-detail-badge-want',
      dotClassName: 'place-detail-badge-want-dot',
    }
  }
  if (status === 'no_thanks') {
    return {
      borderColor: 'var(--border-strong)',
      dotColor: 'var(--fg-muted)',
      textColor: 'var(--fg-2)',
    }
  }
  return {
    borderColor: 'var(--accent)',
    dotColor: 'var(--accent)',
    textColor: 'var(--fg-1)',
  }
}
