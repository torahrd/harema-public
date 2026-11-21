// 言語の約束(packages/shared/i18n/locale.ts)。許可リスト(ja・en)にだけ丸まり、無ければ ja。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LOCALES, localeSchema, matchLocale, parseAcceptLanguage } from '@harema/shared/i18n'

const pick = (header, enabled) => matchLocale(parseAcceptLanguage(header), enabled)

describe('matchLocale', () => {
  it('並びの先頭から、最初に当たった対応言語', () => {
    assert.equal(matchLocale(['en-US', 'ja']), 'en')
    assert.equal(matchLocale(['ja', 'en']), 'ja')
    assert.equal(matchLocale(['fr', 'en-GB']), 'en')
  })
  it('当たらない・空なら ja(入力の文字列は返さない)', () => {
    assert.equal(matchLocale(['fr']), 'ja')
    assert.equal(matchLocale([]), 'ja')
  })
  it('有効な言語が ja だけなら常に ja', () => {
    assert.equal(matchLocale(['en-US', 'en'], ['ja']), 'ja')
    assert.equal(pick('en-US,en;q=0.9', ['ja']), 'ja')
  })
  it('返す値は LOCALES のどれか', () => {
    for (const h of ['en', 'ja', 'fr', 'de-CH', 'xx', 'EN-us']) assert.ok(LOCALES.includes(pick(h)), h)
  })
})

describe('parseAcceptLanguage → matchLocale', () => {
  it('q 値の大きい順', () => {
    assert.equal(pick('ja;q=0.5, en;q=0.9'), 'en')
    assert.deepEqual(parseAcceptLanguage('ja;q=0.5, en;q=0.9, fr'), ['fr', 'en', 'ja'])
  })
  it('同じ q は書かれた順', () => {
    assert.deepEqual(parseAcceptLanguage('en, ja'), ['en', 'ja'])
    assert.deepEqual(parseAcceptLanguage('ja,en-US;q=0.8,en;q=0.8'), ['ja', 'en-us', 'en'])
  })
  it('q=0 は捨てる', () => {
    assert.equal(pick('en;q=0, ja'), 'ja')
    assert.deepEqual(parseAcceptLanguage('en;q=0'), [])
  })
  it('* と、主の言語が英字 2〜3 字でない物は捨てる', () => {
    assert.equal(pick('*'), 'ja')
    assert.deepEqual(parseAcceptLanguage('*'), [])
    assert.equal(pick('en"><script>'), 'ja')
    assert.deepEqual(parseAcceptLanguage('e, engl, 12, en"><script>'), [])
  })
  it('null と空文字は空の並び → ja', () => {
    assert.deepEqual(parseAcceptLanguage(null), [])
    assert.deepEqual(parseAcceptLanguage(''), [])
    assert.equal(pick(null), 'ja')
    assert.equal(pick(''), 'ja')
  })
  it('大文字と小文字は区別しない', () => {
    assert.equal(pick('EN-us'), 'en')
    assert.deepEqual(parseAcceptLanguage('EN-US'), ['en-us'])
  })
  it('先頭の 1,000 字だけを読む(1,001 字目より後の en は見ない)', () => {
    const long = `${'x'.repeat(1000)},en`
    assert.ok(long.length > 1000)
    assert.equal(pick(long), 'ja')
    assert.equal(pick(`${' '.repeat(990)}en`), 'en')
  })
})

describe('localeSchema', () => {
  it('ja・en だけ通す', () => {
    assert.equal(localeSchema.safeParse('en').success, true)
    assert.equal(localeSchema.safeParse('ja').success, true)
    for (const v of ['fr', 'en; x', '', 1, null]) assert.equal(localeSchema.safeParse(v).success, false)
  })
})
