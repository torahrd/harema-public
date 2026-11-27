// JN-8: 日本語の店名の口(details-cache.ts の getJapaneseDisplayName)。偽の placesLibrary で動かす。harema#219
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { getJapaneseDisplayName, getPlaceDetails } from '../details-cache.ts'

const TTL = 10 * 60 * 1000
const realNow = Date.now
afterEach(() => {
  Date.now = realNow
})

/** `new Place({ id, requestedLanguage })` と `fetchFields` を数える偽の Places ライブラリ。 */
function fakeLibrary({ failNext = 0, jaLanguageCode = 'ja' } = {}) {
  const log = { constructed: [], fetches: [] }
  let failures = failNext
  class Place {
    constructor(options) {
      this.id = options.id
      this.options = options
      log.constructed.push(options)
    }
    async fetchFields({ fields }) {
      log.fetches.push({ options: this.options, fields: [...fields] })
      if (failures > 0) {
        failures -= 1
        throw new Error('network')
      }
      const ja = this.options.requestedLanguage === 'ja'
      if (fields.includes('displayName')) {
        this.displayName = ja ? '天ぷら 一心' : 'Tempura Isshin'
        this.displayNameLanguageCode = ja ? jaLanguageCode : 'en'
      }
      if (fields.includes('formattedAddress')) this.formattedAddress = '東京'
    }
  }
  return { library: { Place }, log }
}

describe('JN-8 getJapaneseDisplayName', () => {
  it('new Place は { id, requestedLanguage: "ja" }・fields は ["displayName"]・返す形は { displayName, displayNameLanguageCode }', async () => {
    const { library, log } = fakeLibrary()
    const result = await getJapaneseDisplayName(library, 'ChIJ-8a')
    assert.deepEqual(log.constructed, [{ id: 'ChIJ-8a', requestedLanguage: 'ja' }])
    assert.deepEqual(log.fetches.map((f) => f.fields), [['displayName']])
    assert.deepEqual(result, { displayName: '天ぷら 一心', displayNameLanguageCode: 'ja' })
  })

  it('言語が返らない Place は displayNameLanguageCode が null', async () => {
    const { library } = fakeLibrary()
    class NoLanguagePlace extends library.Place {
      async fetchFields(args) {
        await super.fetchFields(args)
        this.displayNameLanguageCode = undefined
      }
    }
    const result = await getJapaneseDisplayName({ Place: NoLanguagePlace }, 'ChIJ-8b')
    assert.deepEqual(result, { displayName: '天ぷら 一心', displayNameLanguageCode: null })
  })

  it('TTL 内の 2 回目は取得 0 回・TTL を過ぎたら取り直す', async () => {
    const { library, log } = fakeLibrary()
    const base = realNow()
    Date.now = () => base
    await getJapaneseDisplayName(library, 'ChIJ-8c')
    Date.now = () => base + TTL - 1
    await getJapaneseDisplayName(library, 'ChIJ-8c')
    assert.equal(log.fetches.length, 1)
    Date.now = () => base + TTL + 1
    await getJapaneseDisplayName(library, 'ChIJ-8c')
    assert.equal(log.fetches.length, 2)
  })

  it('その後の getPlaceDetails は requestedLanguage の無い別の Place で取る(表示言語の項目を書き換えない)', async () => {
    const { library, log } = fakeLibrary()
    await getJapaneseDisplayName(library, 'ChIJ-8d')
    const place = await getPlaceDetails(library, 'ChIJ-8d', ['displayName', 'formattedAddress'])
    assert.equal(place.displayName, 'Tempura Isshin', '表示言語(英語)の名前')
    assert.equal(place.options.requestedLanguage, undefined)
    assert.deepEqual(log.constructed, [{ id: 'ChIJ-8d', requestedLanguage: 'ja' }, { id: 'ChIJ-8d' }])
    // 順序が逆でも、表示言語の Place は日本語の取得で入れ替わらない(取得は増えない)
    const again = await getPlaceDetails(library, 'ChIJ-8d', ['displayName'])
    assert.equal(again, place)
    assert.equal(again.displayName, 'Tempura Isshin')
    assert.equal(log.fetches.length, 2)
  })

  it('表示言語の項目を先に持っていても、日本語の取得はそれを使わない・書き換えない', async () => {
    const { library, log } = fakeLibrary()
    const english = await getPlaceDetails(library, 'ChIJ-8e', ['displayName'])
    const ja = await getJapaneseDisplayName(library, 'ChIJ-8e')
    assert.equal(ja.displayName, '天ぷら 一心')
    assert.equal(english.displayName, 'Tempura Isshin')
    assert.deepEqual(log.constructed.map((o) => o.requestedLanguage), [undefined, 'ja'])
    const cached = await getPlaceDetails(library, 'ChIJ-8e', ['displayName'])
    assert.equal(cached, english)
    assert.equal(log.fetches.length, 2)
  })

  it('失敗の後の次の呼び出しは取り直す(失敗は覚えない)', async () => {
    const { library, log } = fakeLibrary({ failNext: 1 })
    await assert.rejects(() => getJapaneseDisplayName(library, 'ChIJ-8f'))
    const result = await getJapaneseDisplayName(library, 'ChIJ-8f')
    assert.equal(result.displayName, '天ぷら 一心')
    assert.equal(log.fetches.length, 2)
  })

  it('キャッシュは上限 100 件で古い順に落ちる', async () => {
    const { library, log } = fakeLibrary()
    for (let i = 0; i < 101; i += 1) await getJapaneseDisplayName(library, `ChIJ-8g-${i}`)
    assert.equal(log.fetches.length, 101)
    await getJapaneseDisplayName(library, 'ChIJ-8g-100')
    assert.equal(log.fetches.length, 101, '新しい物は残る')
    await getJapaneseDisplayName(library, 'ChIJ-8g-0')
    assert.equal(log.fetches.length, 102, '一番古い物は落ちている')
  })
})
