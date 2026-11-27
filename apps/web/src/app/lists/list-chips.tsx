'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { META } from '../text-styles'
import type { ListItem } from './types'

/**
 * リストの絞りの札の列(横に流れる)。「すべて」+ リストの札。選んだ札は墨の塗り(地と枠 `--fg-1`・字 `--bg`・太さ 700)。
 * 札の値は店舗詳細の状態の札と同じ(枠 1px・角 `--radius-chip`・余白 5px 12px・META)。
 * - `variant="map"`: 地図の上に浮く(札ごとに地 `--surface`・影 `--shadow-1`)。
 * - `variant="saved"`: 一覧のタブの下の高さ 44 の段。絞るだけで、リストを作る・変える・消す入口は置かない
 *   (それは「リスト」の画面 `lists-screen.tsx`。所有者の決定 2026-11-25 20:21 JST・harema#152 のコメント 7160942619)。
 * 仮の決定(所有者の再確認待ち・harema#152)。
 */

type ListChipsProps = {
  lists: readonly ListItem[]
  /** 今の絞り(null = すべて)。呼び出し側が `resolveSelectedList` を通した値を渡す。 */
  selectedId: string | null
  onSelect: (id: string | null) => void
  variant: 'map' | 'saved'
}

function chipStyle(selected: boolean, floating: boolean): React.CSSProperties {
  return {
    ...META,
    flex: 'none',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    border: `1px solid ${selected ? 'var(--fg-1)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-chip)',
    padding: '5px 12px',
    background: selected ? 'var(--fg-1)' : 'var(--surface)',
    color: selected ? 'var(--bg)' : 'var(--fg-1)',
    fontWeight: selected ? 700 : undefined,
    boxShadow: floating ? 'var(--shadow-1)' : undefined,
  }
}

export function ListChips({ lists, selectedId, onSelect, variant }: ListChipsProps) {
  const t = useTranslations('web.lists')
  const floating = variant === 'map'
  const scrollerRef = useRef<HTMLDivElement>(null)
  // 付いた時(画面に着いた時・地図で列が付け直された時)に 1 回だけ、選ばれている札が列の見える幅の外なら、
  // 見える幅に入る最小の量だけ列を横に動かす。引き継いだ絞りの札が画面の外に隠れないように(単位 lists-filter-carry)。
  // 札を押した時は動かさない(押せる札は見えている)。頁全体を動かす scrollIntoView は使わない。
  useEffect(() => {
    const scroller = scrollerRef.current
    const chip = scroller?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!scroller || !chip) return
    const box = scroller.getBoundingClientRect()
    const rect = chip.getBoundingClientRect()
    const style = window.getComputedStyle(scroller)
    const chipLeft = rect.left - box.left + scroller.scrollLeft
    const chipRight = chipLeft + rect.width
    if (chipRight > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollTo({
        left: chipRight - scroller.clientWidth + (parseFloat(style.paddingRight) || 0),
        behavior: 'instant',
      })
    } else if (chipLeft < scroller.scrollLeft) {
      scroller.scrollTo({ left: chipLeft - (parseFloat(style.paddingLeft) || 0), behavior: 'instant' })
    }
  }, [])
  const chips = (
    <div
      ref={scrollerRef}
      role="group"
      data-testid="list-chips"
      aria-label={t('filterLabel')}
      className="list-chips-scroll"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        minWidth: 0,
        ...(floating
          ? {
              flex: 'none',
              width: 'fit-content',
              // 横に流す器は影を上下・左端で切るので、影(--shadow-1: y8・ぼかし 24)の分だけ器を広げ、
              // 負の余白で位置は変えない。
              maxWidth: 'calc(100% + 24px)',
              padding: '8px 12px 24px',
              margin: '-8px -12px -24px',
              pointerEvents: 'auto' as const,
            }
          : { flex: 1 }),
      }}
    >
      <button
        type="button"
        aria-pressed={selectedId === null}
        onClick={() => onSelect(null)}
        style={chipStyle(selectedId === null, floating)}
      >
        {t('filterAll')}
      </button>
      {lists.map((list) => (
        <button
          key={list.id}
          type="button"
          aria-pressed={selectedId === list.id}
          onClick={() => onSelect(list.id)}
          style={chipStyle(selectedId === list.id, floating)}
        >
          {list.icon !== null ? `${list.icon} ${list.name}` : list.name}
        </button>
      ))}
    </div>
  )

  if (variant === 'map') return chips

  return (
    <div
      style={{
        flex: 'none',
        height: 44,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
      }}
    >
      {chips}
    </div>
  )
}
