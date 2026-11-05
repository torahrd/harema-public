// search-mode(地図の検索の「飲食店以外を検索結果に含める」スイッチ)の web の合否。SW-1〜SW-7。
// 実行: `pnpm --filter web test`(source を文字列で読む。分類だけは純粋な関数を直接呼ぶ)。
// 読み上げの props(role・aria-checked・名前)は、ここでは字で照合し、画面では撮影の V-W3〜V-W5 が見る。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { classifySuggestions } from '../classify-suggestions.ts'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
// 照合の前にコメントを除く(経緯のコメントに検索語が当たらないように)。
const stripComments = (src) =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/(?<!:)\/\/.*$/gm, '')
const count = (src, needle) => src.split(needle).length - 1

const chrome = stripComments(read('map-chrome.tsx'))
const suggestions = stripComments(read('search-suggestions.tsx'))
const screen = stripComments(read('map-screen.tsx'))
const hook = stripComments(read('use-autocomplete-suggestions.ts'))
const css = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8')

const LABEL = '飲食店以外を検索結果に含める'
const NOTE = '※マップが移動します。保存はできません。'

describe('SW-1 検索欄の下に切り替えが無い(map-chrome)', () => {
  it('button は × とメニューの 2 つだけ・mode / onModeChange の props と SearchMode の import が無い', () => {
    assert.equal(count(chrome, '<button'), 2)
    assert.ok(!/\bmode\b/.test(chrome))
    assert.ok(!chrome.includes('onModeChange'))
    assert.ok(!chrome.includes('SearchMode'))
    assert.ok(chrome.includes('aria-label="検索をクリア"'))
    assert.ok(chrome.includes('aria-label="メニュー"'))
  })
})

describe('SW-2 スイッチの行(search-suggestions)', () => {
  it('role=switch・aria-checked・反転の式・高さ 48', () => {
    assert.ok(suggestions.includes('role="switch"'))
    assert.ok(suggestions.includes('aria-checked={checked}'))
    assert.ok(suggestions.includes('checked={mode === \'map\'}'))
    assert.ok(suggestions.includes("onModeChange(mode === 'map' ? 'store' : 'map')"))
    assert.ok(suggestions.includes('minHeight: 48'))
    assert.ok(suggestions.includes('type="button"'))
  })
  it('絵のスイッチは aria-hidden(読み上げは行全体のボタンの名前と状態)', () => {
    assert.ok(suggestions.includes('aria-hidden="true"'))
  })
})

describe('SW-3 枠の出し分け', () => {
  it('panelContent を呼び none なら null・hasSwitch は onModeChange から・rows の時だけ行を描く', () => {
    assert.ok(suggestions.includes('panelContent({'))
    assert.match(suggestions, /hasSwitch: onModeChange !== undefined/)
    assert.match(suggestions, /if \(content === 'none'\) return null/)
    assert.match(suggestions, /content === 'rows' &&\s*rows\.map\(/)
  })
})

describe('SW-4 行と注記', () => {
  it('行は suggestionRows から描く・見出しが無い・注記は location の行だけ', () => {
    assert.ok(suggestions.includes('suggestionRows(mode, suggestions)'))
    assert.ok(!suggestions.includes('GroupHeader'))
    assert.equal(count(suggestions, "note={bucket === 'location'}"), 1)
    assert.equal(count(suggestions, 'LOCATION_NOTE'), 2) // 定義 1 + 描く 1(note の条件の中)
    const render = suggestions.indexOf('{note && (')
    assert.ok(render >= 0 && suggestions.indexOf('<JpText text={LOCATION_NOTE} />') > render)
  })
})

describe('SW-5 検索を閉じるとオフへ戻る(map-screen)', () => {
  it('closeSearch の本体に setMode(store)・setSearchOpen(false) は closeSearch の 1 か所・MapChrome に mode を渡さない', () => {
    const start = screen.indexOf('const closeSearch = useCallback(')
    const end = screen.indexOf('}, [resetSession])', start)
    assert.ok(start >= 0 && end > start)
    const body = screen.slice(start, end)
    assert.ok(body.includes("setMode('store')"))
    assert.equal(count(screen, 'setSearchOpen(false)'), 1)
    assert.ok(body.includes('setSearchOpen(false)'))
    assert.ok(screen.includes('onModeChange={setMode}'))
    const chromeTag = screen.slice(screen.indexOf('<MapChrome'), screen.indexOf('onMenuClick', screen.indexOf('<MapChrome')))
    assert.ok(!/\bmode=/.test(chromeTag))
    assert.ok(!chromeTag.includes('onModeChange'))
  })
})

describe('SW-6 分類と順(純粋)', () => {
  const pred = (placeId, types, withText = true) => ({
    placePrediction: {
      placeId,
      types,
      text: { text: `text-${placeId}` },
      mainText: withText ? { text: `main-${placeId}` } : null,
      secondaryText: null,
    },
  })
  const classify = (types) => (types.includes('food') ? 'food' : types.includes('station') ? 'location' : null)

  it('場所・捨てる型・飲食・場所 → 残った 3 件の rank は 0・1・2(群ごとでなく通し)', () => {
    const g = classifySuggestions(
      [pred('a', ['station']), pred('b', ['store']), pred('c', ['food']), pred('d', ['station'])],
      classify,
    )
    assert.deepEqual(g.location.map((x) => [x.placeId, x.rank]), [['a', 0], ['d', 2]])
    assert.deepEqual(g.food.map((x) => [x.placeId, x.rank]), [['c', 1]])
  })
  it('飲食だけ 2 件 → 0・1', () => {
    const g = classifySuggestions([pred('a', ['food']), pred('b', ['food'])], classify)
    assert.deepEqual(g.food.map((x) => x.rank), [0, 1])
    assert.deepEqual(g.location, [])
  })
  it('placePrediction の無い項目は捨てて数えない・prediction はそのまま運ぶ', () => {
    const items = [{ queryPrediction: {} }, { placePrediction: null }, pred('a', ['food'])]
    const g = classifySuggestions(items, classify)
    assert.equal(g.food[0].rank, 0)
    assert.equal(g.food[0].prediction, items[2].placePrediction)
    assert.equal(g.food[0].mainText, 'main-a')
  })
  it('mainText が無ければ text を使う', () => {
    const g = classifySuggestions([pred('a', ['food'], false)], classify)
    assert.equal(g.food[0].mainText, 'text-a')
  })
  it('hook: 取得は 1 か所・classifySuggestions を呼ぶ・mode の語が無い', () => {
    assert.equal(count(hook, 'fetchAutocompleteSuggestions('), 1)
    assert.ok(hook.includes('classifySuggestions(raw, classifyPlaceTypes)'))
    assert.ok(!/\bmode\b/i.test(hook))
  })
})

describe('SW-7 文言と色', () => {
  const mapSources = ['map-screen.tsx', 'map-chrome.tsx', 'search-suggestions.tsx', 'use-autocomplete-suggestions.ts']
  it('文言は web の map の中でそれぞれ 1 か所の定数', () => {
    const all = mapSources.map((n) => stripComments(read(n))).join('\n')
    assert.equal(count(all, LABEL), 1)
    assert.equal(count(all, NOTE), 1)
    assert.ok(suggestions.includes(`const SWITCH_LABEL = '${LABEL}'`))
    assert.ok(suggestions.includes(`const LOCATION_NOTE = '${NOTE}'`))
  })
  it('色の定数に --fg-1・--surface・--switch-off-border・--switch-thumb-shadow', () => {
    const block = suggestions.slice(suggestions.indexOf('const SWITCH_COLORS'), suggestions.indexOf('} as const'))
    for (const v of ['--fg-1', '--surface', '--switch-off-border', '--switch-thumb-shadow']) {
      assert.ok(block.includes(`var(${v})`), v)
    }
  })
  it('globals.css の 4 つの塊に --switch-off-border があり、暗い 2 つは rgba(216, 218, 212, 0.32)', () => {
    const defs = [...css.matchAll(/--switch-off-border: ([^;]+);/g)].map((m) => m[1])
    assert.equal(defs.length, 4)
    assert.equal(defs.filter((v) => v === '#d8dad4').length, 2)
    assert.equal(defs.filter((v) => v === 'rgba(216, 218, 212, 0.32)').length, 2)
    assert.equal([...css.matchAll(/--switch-thumb-shadow: 0 1px 3px rgba\(0, 0, 0, 0\.18\);/g)].length, 4)
  })
})
