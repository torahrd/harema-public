// Web Share Target の受け口(/share)の分け方と配線。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parseSharedItems } from '@harema/shared/share-parse'
import manifest from '../../app/manifest.ts'
import { itemsFromShareParams, SHARE_TARGET_ACTION } from '../share-target.ts'

// コメント(`//` の行末と `/* */`)を除いてから語を探す。
const read = (rel) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const split = (query) => parseSharedItems(itemsFromShareParams(new URLSearchParams(query)))

describe('受け口の道', () => {
  it('WST-M4 受け口のページがある', () => {
    assert.equal(manifest().share_target.action, SHARE_TARGET_ACTION)
    assert.equal(SHARE_TARGET_ACTION, '/share')
    assert.equal(existsSync(new URL('../../app/share/page.tsx', import.meta.url)), true)
  })
})

describe('届いた値の分け方', () => {
  it('WST-T1 Android の Google マップ', () => {
    const r = split('?text=すし匠%0Ahttps%3A%2F%2Fmaps.app.goo.gl%2FAbC123')
    assert.equal(r.searchQuery, 'すし匠')
    assert.equal(r.sourceText, 'https://maps.app.goo.gl/AbC123')
  })

  it('WST-T2 題に店名', () => {
    const r = split(
      new URLSearchParams({ title: 'すし匠 (四ツ谷/寿司) - 食べログ', text: 'https://tabelog.com/tokyo/A1/' }),
    )
    assert.equal(r.searchQuery, 'すし匠')
    assert.equal(r.sourceText, 'https://tabelog.com/tokyo/A1/')
  })

  it('WST-T3 Instagram', () => {
    const r = split(new URLSearchParams({ text: 'https://www.instagram.com/p/xyz/?igsh=abc' }))
    assert.equal(r.searchQuery, '')
    assert.equal(r.sourceText, 'https://www.instagram.com/p/xyz/')
  })

  it('WST-T4 url 欄', () => {
    const r = split(new URLSearchParams({ url: 'https://tabelog.com/x', text: 'すし匠' }))
    assert.equal(r.sourceText, 'https://tabelog.com/x')
    assert.equal(r.searchQuery, 'すし匠')
  })

  it('WST-T5 危ない値', () => {
    assert.equal(split(new URLSearchParams({ url: 'javascript:alert(1)' })).sourceText, null)
    assert.equal(split(new URLSearchParams({ url: 'https://u:p@example.com/' })).sourceText, null)
  })

  it('WST-T6 iOS と同じ形の入力を作る(url → text → title・空と重複は捨てる)', () => {
    assert.deepEqual(
      itemsFromShareParams(
        new URLSearchParams({ title: 'すし匠 (四ツ谷/寿司) - 食べログ', text: 'https://tabelog.com/tokyo/A1/' }),
      ),
      [
        { kind: 'text', value: 'https://tabelog.com/tokyo/A1/' },
        { kind: 'text', value: 'すし匠 (四ツ谷/寿司) - 食べログ' },
      ],
    )
    assert.deepEqual(itemsFromShareParams(new URLSearchParams({ url: 'https://tabelog.com/x', text: 'すし匠' })), [
      { kind: 'url', value: 'https://tabelog.com/x' },
      { kind: 'text', value: 'すし匠' },
    ])
    assert.deepEqual(itemsFromShareParams(new URLSearchParams('text=%0Ahttps%3A%2F%2Fmaps.app.goo.gl%2FAbC123')), [
      { kind: 'text', value: '\nhttps://maps.app.goo.gl/AbC123' },
    ])
    assert.deepEqual(itemsFromShareParams(new URLSearchParams({ text: 'a', title: 'a', url: '  ' })), [
      { kind: 'text', value: 'a' },
    ])
    assert.deepEqual(itemsFromShareParams(new URLSearchParams('')), [])
  })
})

describe('受け口の配線(ソース照合)', () => {
  const receiver = read('../../app/share/share-receiver.tsx')
  const page = read('../../app/share/page.tsx')

  it('WST-R1 受け口は端末に置いて地図へ', () => {
    assert.ok(receiver.includes('putPendingShare('))
    assert.ok(receiver.includes("window.location.replace('/map')"))
    assert.equal(count(receiver, 'location.replace('), 1)
  })

  it('WST-R2 戻り先を読まない', () => {
    for (const text of [receiver, page]) {
      for (const needle of [".get('next')", '.get("next")', 'redirect(', 'router.push']) {
        assert.equal(count(text, needle), 0, needle)
      }
    }
    assert.ok(!page.includes('searchParams'))
    assert.ok(!page.includes('cookies'))
  })

  it('WST-R3 HTML として差さない', () => {
    for (const rel of [
      '../../app/share/share-receiver.tsx',
      '../../app/share/page.tsx',
      '../share-target.ts',
      '../share-pending.ts',
    ]) {
      const text = read(rel)
      assert.equal(count(text, 'dangerouslySetInnerHTML'), 0, rel)
      assert.equal(count(text, 'innerHTML'), 0, rel)
    }
  })
})

function count(text, needle) {
  return text.split(needle).length - 1
}
