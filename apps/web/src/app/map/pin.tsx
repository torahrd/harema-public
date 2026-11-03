import type { SavedPlaceStatus } from '@harema/shared/constants'

/** ピンの輪郭の path(24×30)。一覧の地図の灰色のピン(saved/list-pin.tsx)と共有する。 */
export const PIN_OUTLINE_PATH =
  'M12 1.3 C6 1.3 1.7 5.7 1.7 11 C1.7 18 12 28.6 12 28.6 C12 28.6 22.3 18 22.3 11 C22.3 5.7 18 1.3 12 1.3 Z'

/**
 * 状態別ピン(spec §7 / design Pin.dc.html sys="a" を逐語移植)。24×30px・viewBox 0 0 24 30。
 * 行きたい(want_to_go)= 藍の輪郭 / また行きたい(visit_again)= 金の充填。もういいは地図に
 * 出さない(クエリ層で除外)ので描かない。色・drop-shadow は globals.css の pin トークン
 * (@media 追従・Tailwind の dark バリアントは使わない)。表示専用でタップハンドラは持たない
 * (S1 起動は後続 WP)。
 */
export function Pin({ status }: { status: SavedPlaceStatus }) {
  if (status === 'visit_again') {
    return (
      <svg
        viewBox="0 0 24 30"
        width="24"
        height="30"
        fill="none"
        style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(var(--pin-shadow))' }}
      >
        <path
          d={PIN_OUTLINE_PATH}
          fill="var(--pin-again-fill)"
          stroke="var(--pin-again-stroke)"
          strokeWidth="1"
        />
        <circle cx="12" cy="11" r="3.3" fill="var(--pin-again-core)" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 30"
      width="24"
      height="30"
      fill="none"
      style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(var(--pin-shadow))' }}
    >
      <path
        d={PIN_OUTLINE_PATH}
        fill="var(--pin-want-fill)"
        stroke="var(--pin-want-stroke)"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="11" r="3.6" stroke="var(--pin-want-stroke)" strokeWidth="1.7" />
    </svg>
  )
}
