'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { JapaneseNameState } from '@harema/shared/ja-name'
import { META } from '../text-styles'

/**
 * 英語の画面の「日本語の店名」の札と、押した後の行(harema#219。所有者の決定 2026-11-25 15:41 の案 3 押せる札・15:47 の文言・15:53 の取れなかった時は案 B)。
 * 保存のシートと店舗詳細が共に使う。値は今ある部品のものをそのまま使い、新しい値は作らない。
 *
 * - `chip`: 札。値は一覧のリストの札の選んでいない時(`lists/list-chips.tsx` の `chipStyle`)と同じ(高さ 32)。押すと `onReveal`。
 *   取れなかった時(`error`)は札を残し、札のすぐ下に赤い字の 1 行(保存の失敗と同じ `META`・`--akane-text`・`role="alert"`)。
 * - `loading`: 札の位置に高さ 20 の行。中に灰色の棒(`.saved-skeleton-bar`・幅 44%・高さ 9。店舗詳細の住所の棒の値)。
 * - `name`・`same`・`none`: 同じ行に、日本語の店名・`Same as the name above.`・`No Japanese name.`(住所と同じ `META`・`--fg-2`)。
 * - `hidden`: 何も描かない。
 * - 焦点: 札を押した時だけ、結果の行(`tabIndex={-1}`)へ焦点を移し、取れなくて札に戻る時は札へ戻す(札が DOM から外れて焦点が `body` へ飛ぶのを防ぐ)。
 *   開いた時には動かさない。結果の行は押せる物ではないので、焦点の輪は出さない(`outline: 'none'`。`save-sheet.tsx` の入力の前例)。
 * 上の間は `marginTop`(店舗詳細 5・保存のシート 4)。下の間は部品の一番下の要素に付ける(赤い字が出ている時は赤い字の行)。
 */

type JapaneseNameSlotProps = {
  state: JapaneseNameState
  onReveal: () => void
  marginTop: number
  marginBottom?: number
}

// 札の値は `lists/list-chips.tsx` の `chipStyle`(選んでいない時・影なし)と同じ字。テストが両方を読んで照らす。
const CHIP_STYLE: React.CSSProperties = {
  ...META,
  flex: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-chip)',
  padding: '5px 12px',
  background: 'var(--surface)',
  color: 'var(--fg-1)',
}

export function JapaneseNameSlot({ state, onReveal, marginTop, marginBottom }: JapaneseNameSlotProps) {
  const t = useTranslations('web.japaneseName')
  const chipRef = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)

  // 押した時だけ焦点を移す(開いた時・店が替わった時には動かさない)。hidden の早い return より前に置く。
  // 札へ戻すのは取得に失敗した時(error)だけ。読み込み中に店が替わって札になった時は動かさない。
  useEffect(() => {
    if (!pressed.current) return
    if (state.phase === 'chip') {
      if (state.error) chipRef.current?.focus()
    } else if (state.phase !== 'hidden') resultRef.current?.focus()
    if (state.phase !== 'loading') pressed.current = false
  }, [state.phase, state.error])

  if (state.phase === 'hidden') return null

  if (state.phase === 'chip') {
    return (
      <>
        <div style={{ display: 'flex', marginTop, ...(state.error ? null : { marginBottom }) }}>
          <button
            ref={chipRef}
            type="button"
            onClick={() => {
              pressed.current = true
              onReveal()
            }}
            style={CHIP_STYLE}
          >
            {t('show')}
          </button>
        </div>
        {state.error && (
          <p role="alert" style={{ ...META, color: 'var(--akane-text)', marginTop, marginBottom: marginBottom ?? 0 }}>
            {t('failed')}
          </p>
        )}
      </>
    )
  }

  // loading・name・same・none は同じ要素で描く(読み上げの領域が、届く前から在るようにするため)
  const loading = state.phase === 'loading'
  const text =
    state.phase === 'name' ? state.text : state.phase === 'same' ? t('same') : state.phase === 'none' ? t('none') : null
  return (
    <div
      ref={resultRef}
      tabIndex={-1}
      aria-live="polite"
      style={{
        outline: 'none',
        ...META,
        color: 'var(--fg-2)',
        marginTop,
        marginBottom,
        ...(loading ? { height: 20, display: 'flex', alignItems: 'center' } : null),
      }}
    >
      {loading ? <div className="saved-skeleton-bar" style={{ width: '44%', height: 9 }} /> : text}
    </div>
  )
}
