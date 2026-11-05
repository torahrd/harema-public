'use client'

import { SAVE_SUCCESS_TOAST } from './save-sheet-copy'
import type { MapToastVariant, SearchErrorVariant } from './types'
import { META } from '../text-styles'
import { JpText } from '../_ui/jp-text'

/**
 * 上部トースト(design ④ 逐語)。2b 造形を踏襲しつつ、失敗は成功と記号で分ける ——
 * 成功が「素のチェック ✓ + 金(--accent)」なのに対し、失敗は「円で受けた記号(alert-circle)
 * + 茜(--akane-text)」。茜はアイコンの線のみで本文は fg-1 のまま(リンクトースト・M2 中止と
 * 同じ「茜は最小の記号」の原則)。器・定位置・タイマーは 3 種で共通。
 *
 * 文言は失敗 2 種で分ける。直前の操作が違うため —— 入力中(A: 候補の取得失敗)と選択後
 * (B: 詳細の取得失敗)で、尾が名指す次の一手が「検索」と「選び直し」に分かれる。骨格
 * 「〜ませんでした。」は共通。「失敗しました」は使わない(主語を道具に移し、道具が
 * できなかったと引き取る)。「いま、」は付けない(所有者 2026-10-23・11-04)。
 *
 * 位置決めは持たない。MapChrome の toastSlot が検索欄の下端 +9px にアンカーする(検索を
 * 開いていない間に位置情報バナーが出ていれば、バナー下端 +9px。所有者 2026-11-02 D13 案 C)
 * (design「定位置は 9px = チュームの縦リズムと同値」)。表示/タイマーは map-screen が持つ。
 */
const MESSAGES: Record<SearchErrorVariant, { body: string; tail: string }> = {
  // A · AUTOCOMPLETE · 候補の取得失敗
  suggestions: {
    body: '候補を探せませんでした。',
    tail: '少し待って、もう一度検索してください。',
  },
  // B · FETCHFIELDS · 詳細の取得失敗
  details: {
    body: 'この場所を開けませんでした。',
    tail: '少し待って、もう一度お選びください。',
  },
}

/** 保存成功の 1 行(裁定文言)。失敗と違い、次の一手が無いので尾を持たない。 */
const SUCCESS_MESSAGES: Record<'save-created' | 'save-updated', string> = {
  'save-created': SAVE_SUCCESS_TOAST.created,
  'save-updated': SAVE_SUCCESS_TOAST.updated,
}

function isSearchError(variant: MapToastVariant): variant is SearchErrorVariant {
  return variant === 'suggestions' || variant === 'details'
}

export function MapToast({
  variant,
  visible,
  onDismiss,
}: {
  variant: MapToastVariant
  visible: boolean
  onDismiss: () => void
}) {
  const error = isSearchError(variant) ? MESSAGES[variant] : null
  const successMessage = isSearchError(variant) ? null : SUCCESS_MESSAGES[variant]

  return (
    <div
      // 成功は割り込みではないので status。失敗は直前の操作の結果なので alert のまま。
      role={error ? 'alert' : 'status'}
      onClick={onDismiss}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '11px 18px',
        boxShadow: 'var(--shadow-2)',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition:
          'opacity var(--dur-slow) var(--ease), transform var(--dur-slow) var(--ease)',
      }}
    >
      {/* 失敗 = alert-circle(円+!)。✕ は「誤り・拒絶」、雲は比喩過多 —— 円+! が「状態の報せ」
          として最小。成功 = 素のチェック ✓ を金で(spec §7)。線幅は 1.6 で揃える。 */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={error ? 'var(--akane-text)' : 'var(--accent)'}
        strokeWidth="1.6"
        strokeLinecap="round"
        style={{ flex: 'none', marginTop: 2 }}
      >
        {error ? (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </>
        ) : (
          <path d="M4 12.5l5 5L20 6.5" />
        )}
      </svg>
      <p
        style={{
          ...META,
          color: 'var(--fg-1)',
          margin: 0,
          textWrap: 'pretty',
        }}
      >
        {error ? (
          <>
            <JpText text={error.body} />{' '}
            <span style={{ color: 'var(--fg-whisper)' }}><JpText text={error.tail} /></span>
          </>
        ) : (
          successMessage
        )}
      </p>
    </div>
  )
}
