import type { SavedPlaceStatus } from '@harema/shared/constants'
import { PIN_OUTLINE_PATH } from '../map/pin'

/** 押したピンの拡大率(design q2 の `scale=1.35`)。下端中央を基点に拡大する。 */
const SELECTED_SCALE = 1.35

/** 状態別の輪郭・塗り・数字の色(globals.css の pin トークン / `--fg-muted`)。 */
const PIN_COLORS: Record<SavedPlaceStatus, { fill: string; stroke: string; strokeWidth: number; number: string }> = {
  want_to_go: {
    fill: 'var(--pin-want-fill)',
    stroke: 'var(--pin-want-stroke)',
    strokeWidth: 1.7,
    number: 'var(--pin-want-stroke)',
  },
  visit_again: {
    fill: 'var(--pin-again-fill)',
    stroke: 'var(--pin-again-stroke)',
    // 地図画面の また行きたい のピン(map/pin.tsx)と同じ 1。
    strokeWidth: 1,
    number: 'var(--pin-again-core)',
  },
  // もういい = 一覧の地図だけの灰色のピン(所有者 2026-11-02 の問 3 = B)。形は行きたいと同じ輪郭。
  no_thanks: {
    fill: 'var(--pin-want-fill)',
    stroke: 'var(--fg-muted)',
    strokeWidth: 1.7,
    number: 'var(--fg-muted)',
  },
}

type ListPinProps = {
  status: SavedPlaceStatus
  /** そのタブの並び(保存日の新しい順)の 1 始まりの番号。行の左の札と同じ。 */
  number: number
  selected: boolean
}

/**
 * 一覧の地図のピン(所有者 2026-11-02 の問 2 = B・問 3 = B)。輪郭は map/pin.tsx と共有し、
 * 中の円の代わりに行と同じ数字を入れる(10.5px・600)。押したピンは 1.35 倍。
 */
export function ListPin({ status, number, selected }: ListPinProps) {
  const colors = PIN_COLORS[status]
  return (
    <svg
      viewBox="0 0 24 30"
      width="24"
      height="30"
      fill="none"
      style={{
        display: 'block',
        overflow: 'visible',
        filter: 'drop-shadow(var(--pin-shadow))',
        transform: selected ? `scale(${SELECTED_SCALE})` : undefined,
        transformOrigin: 'center bottom',
      }}
    >
      <path d={PIN_OUTLINE_PATH} fill={colors.fill} stroke={colors.stroke} strokeWidth={colors.strokeWidth} />
      <text
        x="12"
        y="14.6"
        textAnchor="middle"
        fontFamily="var(--ff-mono)"
        fontSize="10.5"
        fontWeight="600"
        fill={colors.number}
      >
        {number}
      </text>
    </svg>
  )
}
