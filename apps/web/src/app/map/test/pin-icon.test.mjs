// T-W6: ピンのアイコン(ソースの照合)。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const pin = read('../pin.tsx')
const screen = read('../map-screen.tsx')

describe('T-W6 pin.tsx のアイコン', () => {
  it('Pin が icon を受ける(省略・null はアイコンなし)', () => {
    assert.match(pin, /export function Pin\(\{ status, icon = null \}/)
    assert.ok(pin.includes('icon !== null'))
  })
  it('アイコンの <text> に fill が在る(根の fill="none" に消されない)', () => {
    const text = pin.slice(pin.indexOf('<text'), pin.indexOf('</text>'))
    assert.match(text, /fill="var\(--fg-1\)"/)
    assert.match(text, /fontSize="12"/)
    assert.match(text, /x="12"/)
  })
  it('アイコンの字体は本文の字体が先で、絵文字の字体の後ろに総称があり、style で渡す(属性に戻さない)', () => {
    const font = pin.slice(pin.indexOf('const ICON_FONT'), pin.indexOf('/**', pin.indexOf('const ICON_FONT')))
    assert.ok(font.indexOf('--font-noto-sans,') < font.indexOf('Apple Color Emoji'))
    assert.ok(font.indexOf('--font-noto-sans-jp') < font.indexOf('Apple Color Emoji'))
    assert.ok(font.indexOf('Noto Color Emoji') < font.lastIndexOf('sans-serif'))
    assert.ok(pin.includes('style={{ fontFamily: ICON_FONT }}'))
    assert.ok(!pin.includes('fontFamily={'))
  })
  it('また行きたいは絵の下に r 7.5 の丸い地(--pin-want-fill)を敷く', () => {
    assert.match(pin, /<circle cx="12" cy="11" r="7\.5" fill="var\(--pin-want-fill\)"/)
  })
  it('輪郭の path・状態の色は今のまま(アイコンありでも PIN_OUTLINE_PATH と状態の色を使う)', () => {
    const icon = pin.slice(pin.indexOf('function IconPin'), pin.indexOf('export function Pin'))
    assert.ok(icon.includes('PIN_OUTLINE_PATH'))
    assert.ok(icon.includes('--pin-again-stroke') && icon.includes('--pin-want-stroke'))
  })
})

describe('T-W6 地図の画面が pinIconFor の値を渡す', () => {
  it('絞りを通した行だけをピンにし、pinIconFor の値を Pin に渡す', () => {
    assert.ok(screen.includes('filterByList(allSavedPlaces, activeListId)'))
    assert.ok(screen.includes('savedPlaces.map('))
    assert.ok(screen.includes('icon={pinIconFor(marker.listIds, lists, activeListId)}'))
  })
  it('持っている絞りの id は resolveSelectedList を通してから使う', () => {
    assert.ok(screen.includes('resolveSelectedList(selectedListId, lists)'))
  })
})
