import type { SavedPlaceStatus } from '@harema/shared/constants'

/** ピンの輪郭の path(24×30)。一覧の地図の灰色のピン(saved/list-pin.tsx)と共有する。 */
export const PIN_OUTLINE_PATH =
  'M12 1.3 C6 1.3 1.7 5.7 1.7 11 C1.7 18 12 28.6 12 28.6 C12 28.6 22.3 18 22.3 11 C22.3 5.7 18 1.3 12 1.3 Z'

/**
 * リストのアイコン(1 文字)を出す字体。本文の字体を先に(数字・# を本文と同じ形にする)、絵文字は絵文字の字体。
 * 並びは globals.css の `--ff-sans` と揃える(総称の sans-serif は絵文字の字体の後ろ)。
 */
const ICON_FONT =
  'var(--font-noto-sans, \'Noto Sans\'), var(--font-noto-sans-jp, \'Noto Sans JP\'), "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

/**
 * リストのアイコンつきのピン(所有者の決定 2026-11-16・harema#152)。24×30 のまま、頭の中の丸の代わりに
 * アイコンを中心 (12, 11) に 12px で置く。また行きたいは、アイコンの下に直径 15(r 7.5)の丸い地(`--pin-want-fill`)を敷く。
 * 輪郭の path・色・太さは状態ごとに `Pin` のアイコンなしと同じ(色と形の区別を残す)。
 * `<text>` には `fill` を明示する(根の `fill="none"` が字にも効いて絵が出なくなるため)。
 */
function IconPin({ status, icon }: { status: SavedPlaceStatus; icon: string }) {
  const again = status === 'visit_again'
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
        fill={again ? 'var(--pin-again-fill)' : 'var(--pin-want-fill)'}
        stroke={again ? 'var(--pin-again-stroke)' : 'var(--pin-want-stroke)'}
        strokeWidth={again ? '1' : '1.7'}
      />
      {again && <circle cx="12" cy="11" r="7.5" fill="var(--pin-want-fill)" />}
      <text
        x="12"
        y="11.4"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12"
        style={{ fontFamily: ICON_FONT }}
        fill="var(--fg-1)"
      >
        {icon}
      </text>
    </svg>
  )
}

/**
 * 状態別ピン(spec §7 / design Pin.dc.html sys="a" を逐語移植)。24×30px・viewBox 0 0 24 30。
 * 行きたい(want_to_go)= 藍の輪郭 / また行きたい(visit_again)= 金の充填。もういいは地図に
 * 出さない(クエリ層で除外)ので描かない。色・drop-shadow は globals.css の pin トークン
 * (@media 追従・Tailwind の dark バリアントは使わない)。押すと詳細へ行く処理は
 * このコンポーネントでなく map-screen 側(`AdvancedMarker` の `onClick`)が持つ。
 */
export function Pin({ status, icon = null }: { status: SavedPlaceStatus; icon?: string | null }) {
  if (icon !== null) {
    return <IconPin status={status} icon={icon} />
  }
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
