// PD: 地図の S1 の「詳細情報」(営業時間・電話・website)。取得のガード(place-details-once.ts)・配線(ソース照合)。
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createEnterpriseOnce } from '../place-details-once.ts'

const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const tick = () => new Promise((resolve) => setImmediate(resolve))

/** `open` の位置の括弧(`(` か `{`)から対応する閉じ括弧までの中身。 */
function balanced(source, open) {
  const pair = source[open] === '(' ? ')' : '}'
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === source[open]) depth += 1
    else if (source[i] === pair) {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error('対応する括弧が無い')
}

/** `<tag` の位置から最初の `/>` まで(JSX の自己閉じ要素の属性部)。コメントの中の `<tag` は飛ばし、行の頭(空白の後)にある物だけを見る。 */
function jsxElement(source, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^[ \\t]*${escaped}\\b`, 'm').exec(source)
  assert.ok(match, `${tag} が無い`)
  const at = match.index + match[0].indexOf(tag)
  const end = source.indexOf('/>', at)
  assert.ok(end >= 0, `${tag} の閉じが無い`)
  return source.slice(at, end)
}

const enterprise = { weekdayDescriptions: ['月曜日: 8:00～18:00'], nationalPhoneNumber: '03', websiteURI: null }

describe('PD 地図の S1 の詳細情報', () => {
  it('PD-1 start を 2 回呼んでも load は 1 回', async () => {
    const once = createEnterpriseOnce()
    let loads = 0
    const results = []
    const load = async () => {
      loads += 1
      return enterprise
    }
    assert.equal(once.start(load, (r) => results.push(r)), true)
    assert.equal(once.start(load, (r) => results.push(r)), false)
    await tick()
    assert.equal(loads, 1)
    assert.deepEqual(results, [{ kind: 'ok', value: enterprise }])
  })

  it('PD-2 unmount の後に届いた応答は done を呼ばない(成功・失敗とも)', async () => {
    for (const load of [async () => enterprise, async () => null, async () => Promise.reject(new Error('x'))]) {
      const once = createEnterpriseOnce()
      let calls = 0
      once.start(load, () => {
        calls += 1
      })
      once.unmount()
      await tick()
      assert.equal(calls, 0)
    }
  })

  it('PD-3 unmount → mount(StrictMode の再生)の後に届いた応答は done を呼ぶ', async () => {
    const once = createEnterpriseOnce()
    const results = []
    once.mount()
    once.start(async () => enterprise, (r) => results.push(r))
    once.unmount()
    once.mount()
    await tick()
    assert.deepEqual(results, [{ kind: 'ok', value: enterprise }])
  })

  it('PD-4 load が null を返す・投げると failed', async () => {
    for (const load of [async () => null, () => Promise.reject(new Error('x')), () => {
      throw new Error('sync')
    }]) {
      const once = createEnterpriseOnce()
      const results = []
      once.start(load, (r) => results.push(r))
      await tick()
      assert.deepEqual(results, [{ kind: 'failed' }])
    }
  })

  it('PD-5 配線: SaveSheet は placesLibrary を受けた時だけ行を描き、地図の画面だけが渡す', () => {
    const sheet = src('../save-sheet.tsx')
    const row = sheet.indexOf('<SheetPlaceDetails')
    assert.ok(row >= 0)
    assert.ok(row > sheet.indexOf('{SOURCE_HELPER}'), '行は出典の注記より後')
    assert.ok(row < sheet.indexOf('{CTA_LABELS[mode]}'), '行は主の CTA より前')
    assert.ok(sheet.slice(row - 200, row).includes('placesLibrary !== undefined'), '行は placesLibrary があるときだけ')
    assert.ok(sheet.includes('key={context.googlePlaceId}'))

    assert.ok(jsxElement(src('../map-screen.tsx'), '<SaveSheet').includes('placesLibrary={places}'))
    assert.ok(!jsxElement(src('../../places/[id]/place-detail-screen.tsx'), '<SaveSheet').includes('placesLibrary'))
  })

  it('PD-9 余白: 閉じた時は店舗詳細と同じ間隔(6)、開いた時だけぼかしの高さ(--sp-5)まで広げる', () => {
    const sheet = src('../save-sheet.tsx')
    const at = sheet.indexOf('function SheetPlaceDetails(')
    assert.ok(at >= 0)
    const body = sheet.slice(at)
    assert.ok(body.includes('<PlaceDetailsDisclosure'))
    assert.ok(body.includes('paddingBottom: open ? SHEET_DETAILS_END_OPEN : SHEET_DETAILS_END_CLOSED'))
    assert.ok(body.includes('onExpandedChange={setOpen}'))
    assert.ok(sheet.includes('const SHEET_DETAILS_END_CLOSED = 6'))
    assert.ok(sheet.includes("const SHEET_DETAILS_END_OPEN = 'var(--sp-5)'"))
    const disclosure = src('../place-details-disclosure.tsx')
    const click = disclosure.slice(disclosure.indexOf('const onClick'), disclosure.indexOf('once.start'))
    assert.ok(click.includes('onExpandedChange?.(next)'), '開閉のたびに知らせる')
  })

  it('PD-6 Places の配列: 地図の店名と候補の確定は変わらず、詳細情報は Enterprise の 3 項目だけ', () => {
    const map = src('../map-screen.tsx')
    const open = map.indexOf('const openPlaceSheet')
    assert.ok(open >= 0)
    const call = map.indexOf('getPlaceDetails(', open)
    const openArgs = balanced(map, call + 'getPlaceDetails'.length)
    assert.match(openArgs.replace(/\s+/g, ' '), /places, placeId, \[ 'types', 'displayName', 'location', 'formattedAddress',? ?\]/)
    assert.ok(map.includes("fetchPlaceFields(place, ['location', 'displayName', 'formattedAddress'])"))

    const part = src('../place-details-disclosure.tsx')
    const calls = [...part.matchAll(/getPlaceDetails\(/g)]
    assert.equal(calls.length, 1)
    const args = balanced(part, calls[0].index + 'getPlaceDetails'.length)
    assert.deepEqual([...args.matchAll(/'(\w+)'/g)].map((m) => m[1]), ['regularOpeningHours', 'nationalPhoneNumber', 'websiteURI'])
  })

  it('PD-7 店舗詳細は同じ部品を描く', () => {
    const detail = src('../../places/[id]/place-detail-screen.tsx')
    assert.ok(detail.includes('<PlaceDetailsDisclosure'))
    assert.ok(!detail.includes("'regularOpeningHours'"))
    assert.ok(!detail.includes('enterpriseStartedRef'))
  })

  it('PD-8 部品の配線: start は押した時のハンドラの 1 か所だけ・effect は mount と unmount だけ', () => {
    const source = src('../place-details-disclosure.tsx')
    const calls = [...source.matchAll(/\bstart\(/g)]
    assert.equal(calls.length, 1, 'start( は 1 か所だけ')
    const handlerAt = source.indexOf('const onClick = () => {')
    assert.ok(handlerAt >= 0)
    const handler = balanced(source, source.indexOf('{', handlerAt + 'const onClick = () =>'.length))
    assert.ok(handler.includes('once.start('), 'start は onClick の中')
    assert.ok(source.includes('onClick={onClick}'))

    const effects = [...source.matchAll(/useEffect\(/g)].map((m) => balanced(source, m.index + 'useEffect'.length))
    assert.ok(effects.length >= 1)
    for (const body of effects) assert.ok(!/\bstart\(/.test(body), 'effect の本体で start( を呼んでいる')
    const lifecycle = effects.find((body) => body.includes('once.mount()'))
    assert.ok(lifecycle, 'effect の本体に mount() が無い')
    assert.match(lifecycle, /return \(\) => \{[\s\S]*once\.unmount\(\)[\s\S]*\}/)

    // Places ライブラリが無い間は押せない(disabled)・押されても取りに行かない(ハンドラの保険)。
    assert.match(source, /disabled=\{places === null\}/, '行のボタンに disabled={places === null} が無い')
    const guardAt = handler.search(/places === null\) return/)
    assert.ok(guardAt >= 0, 'onClick に places === null の return が無い')
    assert.ok(guardAt < handler.indexOf('once.start('), 'places === null の return が once.start( より後にある')
  })
})
