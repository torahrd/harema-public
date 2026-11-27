// JN-6・JN-7・JN-10・JN-10b: 英語の画面の日本語の店名(押せる札)の純粋な関数(packages/shared/ja-name)。harema#219
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createJapaneseNameRequest,
  hasJapaneseScript,
  isJapaneseLanguageCode,
  isJapaneseName,
  countryCodeOf,
  japaneseNameOutcome,
  japaneseNameStateFor,
  resolveJapaneseName,
  shouldOfferJapaneseName,
} from '../../../../../../packages/shared/ja-name/index.ts'

const input = (locale, displayName, displayNameLanguageCode, countryCode = 'JP') => ({ locale, displayName, displayNameLanguageCode, countryCode })

describe('JN-6 shouldOfferJapaneseName の表', () => {
  it('ja の画面 → false(国・名前・言語が何でも)', () => {
    for (const [name, code] of [['Tempura Isshin', 'en'], ['天ぷら 一心', 'ja'], ['Cafe', null], ['Cafe', undefined], ['', null]]) {
      assert.equal(shouldOfferJapaneseName(input('ja', name, code)), false, `${name} ${code}`)
    }
  })

  it('en × JP × 言語 en・en-US → true', () => {
    for (const code of ['en', 'en-US', 'EN']) {
      assert.equal(shouldOfferJapaneseName(input('en', 'Tempura Isshin', code)), true, code)
    }
  })

  it('en × JP × 言語 ja・ja-JP・JA・ja-Latn → false(ja-Latn も日本語の側)', () => {
    for (const code of ['ja', 'ja-JP', 'JA', 'ja-Latn']) {
      assert.equal(shouldOfferJapaneseName(input('en', '天ぷら 一心', code)), false, code)
      assert.equal(shouldOfferJapaneseName(input('en', 'Tempura Isshin', code)), false, `ローマ字でも ${code}`)
    }
  })

  it('en × JP × 言語 null・undefined・空 × 名前が仮名・漢字を含む → false', () => {
    for (const code of [null, undefined, '']) {
      for (const name of ['天ぷら 一心', 'そば処 月見', 'ﾗｰﾒﾝ', 'カフェ', '佐々木']) {
        assert.equal(shouldOfferJapaneseName(input('en', name, code)), false, `${name} ${JSON.stringify(code)}`)
      }
    }
  })

  it('en × JP × 言語 null・undefined・空 × 名前がローマ字・中黒だけ → true', () => {
    for (const code of [null, undefined, '']) {
      for (const name of ['Tempura Isshin', 'Café・Bar NOLA', 'BISTRO NOLA', 'Torigen ー']) {
        assert.equal(shouldOfferJapaneseName(input('en', name, code)), true, `${name} ${JSON.stringify(code)}`)
      }
    }
  })

  it('言語タグの形でない値は「不明」と同じに扱う(名前の字で決める)', () => {
    assert.equal(shouldOfferJapaneseName(input('en', 'Tempura', 'en; x')), true)
    assert.equal(shouldOfferJapaneseName(input('en', '天ぷら', 'en; x')), false)
  })

  it('店名が空(空白だけ)→ false', () => {
    for (const name of ['', '   ', '\n']) {
      assert.equal(shouldOfferJapaneseName(input('en', name, 'en')), false, JSON.stringify(name))
      assert.equal(shouldOfferJapaneseName(input('en', name, null)), false, JSON.stringify(name))
    }
  })

  it('en × 国が JP でない → false(US・null・undefined・空・jp・Japan)', () => {
    for (const country of ['US', null, undefined, '', 'jp', 'Japan', 'JPN', ' JP']) {
      assert.equal(shouldOfferJapaneseName({ ...input('en', 'Tempura Isshin', 'en'), countryCode: country }), false, JSON.stringify(country))
    }
  })

  it('部品の関数: isJapaneseLanguageCode・hasJapaneseScript・isJapaneseName', () => {
    assert.equal(isJapaneseLanguageCode('ja'), true)
    assert.equal(isJapaneseLanguageCode('ja-JP'), true)
    assert.equal(isJapaneseLanguageCode('jam'), false, 'ja で始まるだけの別の言語は日本語にしない')
    assert.equal(isJapaneseLanguageCode('en'), false)
    assert.equal(isJapaneseLanguageCode(null), false)
    assert.equal(hasJapaneseScript('Torigen ー'), false)
    assert.equal(hasJapaneseScript('Café・Bar NOLA'), false)
    assert.equal(hasJapaneseScript('天ぷら 一心'), true)
    assert.equal(isJapaneseName({ text: 'Tempura', languageCode: 'ja' }), true, '言語が分かる時は言語が先')
    assert.equal(isJapaneseName({ text: '天ぷら', languageCode: 'en' }), false, '言語が分かる時は字を見ない')
    assert.equal(isJapaneseName({ text: '天ぷら', languageCode: null }), true)
  })

  describe('countryCodeOf', () => {
    const country = (shortText, types = ['country', 'political']) => ({ longText: 'x', shortText, types })
    const street = { longText: '1-2-3', shortText: '1-2-3', types: ['street_number'] }

    it('country の部品の shortText が大文字 2 字 → その値', () => {
      assert.equal(countryCodeOf([street, country('JP')]), 'JP')
      assert.equal(countryCodeOf([country('US')]), 'US')
    })

    it('国の部品が無い・小文字・3 字・数・配列でない・undefined・空・types が配列でない → null', () => {
      assert.equal(countryCodeOf([street]), null)
      assert.equal(countryCodeOf([country('jp')]), null)
      assert.equal(countryCodeOf([country('JPN')]), null)
      assert.equal(countryCodeOf([country(81)]), null)
      assert.equal(countryCodeOf([{ shortText: 'JP', types: 'country' }]), null)
      assert.equal(countryCodeOf({ 0: country('JP') }), null)
      assert.equal(countryCodeOf(undefined), null)
      assert.equal(countryCodeOf(null), null)
      assert.equal(countryCodeOf([]), null)
      assert.equal(countryCodeOf(['country', null, 3]), null)
    })

    it('prototype の getter で shortText・types を持つ class の値(Maps JS の AddressComponent の形)→ 読める', () => {
      class AddressComponent {
        #short
        #types
        constructor(short, types) {
          this.#short = short
          this.#types = types
        }
        get shortText() {
          return this.#short
        }
        get types() {
          return this.#types
        }
      }
      const component = new AddressComponent('JP', ['country', 'political'])
      assert.equal(Object.hasOwn(component, 'shortText'), false, '自分の property ではない(getter)')
      assert.equal(countryCodeOf([new AddressComponent('1', ['street_number']), component]), 'JP')
      assert.equal(countryCodeOf([new AddressComponent('US', ['country'])]), 'US')
    })
  })
})

describe('JN-7 resolveJapaneseName の取得の回数と結果', () => {
  const run = async (inputValue, second) => {
    let calls = 0
    const result = await resolveJapaneseName(inputValue, async () => {
      calls += 1
      if (second instanceof Error) throw second
      return second
    })
    return { result, calls }
  }
  const second = (displayName, displayNameLanguageCode) => ({ displayName, displayNameLanguageCode })

  it('条件に合わない入力(ja の画面・国が US・国が null・名前が日本語)→ 取得 0 回で null', async () => {
    assert.deepEqual(await run(input('ja', 'Tempura', 'en'), second('天ぷら', 'ja')), { result: null, calls: 0 })
    assert.deepEqual(await run(input('en', 'Tempura', 'en', 'US'), second('天ぷら', 'ja')), { result: null, calls: 0 })
    assert.deepEqual(await run(input('en', 'Tempura', 'en', null), second('天ぷら', 'ja')), { result: null, calls: 0 })
    assert.deepEqual(await run(input('en', '天ぷら 一心', 'ja'), second('x', 'ja')), { result: null, calls: 0 })
  })

  it('合う入力 → 取得 1 回', async () => {
    assert.equal((await run(input('en', 'Tempura Isshin', 'en'), second('天ぷら 一心', 'ja'))).calls, 1)
  })

  it('取得が投げる・null → failed(投げない)', async () => {
    assert.deepEqual(await run(input('en', 'Tempura', 'en'), new Error('boom')), { result: { kind: 'failed' }, calls: 1 })
    assert.deepEqual(await run(input('en', 'Tempura', 'en'), null), { result: { kind: 'failed' }, calls: 1 })
  })

  it('同じ名前(前後の空白の差だけ。日本語でない同じ名前も)→ same', async () => {
    assert.deepEqual((await run(input('en', 'BISTRO NOLA', 'en'), second('BISTRO NOLA', 'ja'))).result, { kind: 'same' })
    assert.deepEqual((await run(input('en', 'BISTRO NOLA', 'en'), second('  BISTRO NOLA\n', 'ja'))).result, { kind: 'same' })
    assert.deepEqual((await run(input('en', '  BISTRO NOLA ', 'en'), second('BISTRO NOLA', 'ja'))).result, { kind: 'same' })
    assert.deepEqual((await run(input('en', 'Tempura', 'en'), second('Tempura', 'en'))).result, { kind: 'same' }, '日本語でない同じ名前')
  })

  it('空・1 回目と違って 2 回目の言語が en・言語が不明でローマ字だけ → none', async () => {
    assert.deepEqual((await run(input('en', 'Tempura', 'en'), second('Tempura (JP)', 'en'))).result, { kind: 'none' })
    assert.deepEqual((await run(input('en', 'Tempura', 'en'), second('天ぷら', 'en'))).result, { kind: 'none' }, '言語が分かる時は字を見ない')
    assert.deepEqual((await run(input('en', 'Tempura', 'en'), second('Caffe Luce', null))).result, { kind: 'none' })
    assert.deepEqual((await run(input('en', 'Tempura Isshin', 'en'), second('', 'ja'))).result, { kind: 'none' })
    assert.deepEqual((await run(input('en', 'Tempura Isshin', 'en'), second('   ', 'ja'))).result, { kind: 'none' })
  })

  it('ja で違う名前・言語が不明で仮名か漢字を含む → name とその文字列(前後の空白を除く)', async () => {
    assert.deepEqual((await run(input('en', 'Tempura Isshin', 'en'), second(' 天ぷら 一心 ', 'ja'))).result, { kind: 'name', text: '天ぷら 一心' })
    assert.deepEqual((await run(input('en', 'Tempura Isshin', null), second('天ぷら 一心', 'ja-JP'))).result, { kind: 'name', text: '天ぷら 一心' })
    assert.deepEqual((await run(input('en', 'Tempura', 'en'), second('天ぷら 一心', null))).result, { kind: 'name', text: '天ぷら 一心' })
  })

  it('japaneseNameOutcome は取得を持たない', () => {
    assert.deepEqual(japaneseNameOutcome('Tempura', second('天ぷら', 'ja')), { kind: 'name', text: '天ぷら' })
    assert.deepEqual(japaneseNameOutcome('Tempura', second('Tempura', 'ja')), { kind: 'same' })
    assert.deepEqual(japaneseNameOutcome('Tempura', second('', 'ja')), { kind: 'none' })
  })
})

// 解決を手で進められる取得の模型
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
const view = (request) => {
  const { phase, text, error } = request.snapshot()
  return { phase, text, error }
}
const NAME = { kind: 'name', text: 'えー' }

describe('JN-10 createJapaneseNameRequest', () => {
  it('offer(A, true) → chip・run は呼ばれない(取得 0 回)/ offer(A, false) → hidden・reveal しても取得 0 回', () => {
    const request = createJapaneseNameRequest()
    let calls = 0
    const run = async () => {
      calls += 1
      return NAME
    }
    request.offer('A', true)
    assert.deepEqual(view(request), { phase: 'chip', text: null, error: false })
    assert.equal(calls, 0)
    const hidden = createJapaneseNameRequest()
    hidden.offer('A', false)
    assert.deepEqual(view(hidden), { phase: 'hidden', text: null, error: false })
    assert.equal(hidden.reveal(run), false)
    assert.equal(calls, 0)
  })

  it('reveal → loading → 結果の phase(name・same・none)', async () => {
    for (const [resolution, expected] of [
      [NAME, { phase: 'name', text: 'えー', error: false }],
      [{ kind: 'same' }, { phase: 'same', text: null, error: false }],
      [{ kind: 'none' }, { phase: 'none', text: null, error: false }],
    ]) {
      const request = createJapaneseNameRequest()
      const d = deferred()
      request.offer('A', true)
      assert.equal(request.reveal(() => d.promise), true)
      assert.deepEqual(view(request), { phase: 'loading', text: null, error: false })
      d.resolve(resolution)
      await tick()
      assert.deepEqual(view(request), expected)
    }
  })

  it('reveal を 2 回 → 取得 1 回(loading の間も結果の後も動かない)', async () => {
    const request = createJapaneseNameRequest()
    let calls = 0
    const d = deferred()
    const run = () => {
      calls += 1
      return d.promise
    }
    request.offer('A', true)
    assert.equal(request.reveal(run), true)
    assert.equal(request.reveal(run), false)
    d.resolve(NAME)
    await tick()
    assert.equal(request.reveal(run), false)
    assert.equal(calls, 1)
  })

  it('A で reveal → offer(B, true) → A の応答が届く → 捨てる(B は chip のまま)', async () => {
    const request = createJapaneseNameRequest()
    const a = deferred()
    request.offer('A', true)
    request.reveal(() => a.promise)
    request.offer('B', true)
    a.resolve(NAME)
    await tick()
    assert.deepEqual(request.snapshot(), { placeId: 'B', phase: 'chip', text: null, error: false })
  })

  it('reset の後は同じ店をもう一度 offer でき、前の応答は捨てる', async () => {
    const request = createJapaneseNameRequest()
    const first = deferred()
    request.offer('A', true)
    request.reveal(() => first.promise)
    request.reset()
    assert.deepEqual(request.snapshot(), { placeId: null, phase: 'hidden', text: null, error: false })
    request.offer('A', true)
    first.resolve(NAME)
    await tick()
    assert.deepEqual(view(request), { phase: 'chip', text: null, error: false })
  })

  it('run が投げる・結果が failed → phase は chip で error が true', async () => {
    const request = createJapaneseNameRequest()
    request.offer('A', true)
    request.reveal(() => Promise.resolve({ kind: 'failed' }))
    await tick()
    assert.deepEqual(view(request), { phase: 'chip', text: null, error: true })

    const thrower = createJapaneseNameRequest()
    thrower.offer('A', true)
    thrower.reveal(() => Promise.reject(new Error('boom')))
    await tick()
    assert.deepEqual(view(thrower), { phase: 'chip', text: null, error: true })

    const sync = createJapaneseNameRequest()
    sync.offer('A', true)
    sync.reveal(() => {
      throw new Error('sync boom')
    })
    assert.deepEqual(view(sync), { phase: 'chip', text: null, error: true })
  })

  it('failed の後に reveal → 同じ呼び出しの直後に error が false で loading・取得が 1 回増える / 成功すれば結果・error false', async () => {
    const request = createJapaneseNameRequest()
    let calls = 0
    request.offer('A', true)
    request.reveal(() => {
      calls += 1
      return Promise.resolve({ kind: 'failed' })
    })
    await tick()
    assert.equal(view(request).error, true)
    const d = deferred()
    assert.equal(
      request.reveal(() => {
        calls += 1
        return d.promise
      }),
      true,
    )
    assert.deepEqual(view(request), { phase: 'loading', text: null, error: false })
    assert.equal(calls, 2)
    d.resolve(NAME)
    await tick()
    assert.deepEqual(view(request), { phase: 'name', text: 'えー', error: false })
  })

  it('offer(B, true) と reset の後は error が false', async () => {
    const request = createJapaneseNameRequest()
    request.offer('A', true)
    request.reveal(() => Promise.resolve({ kind: 'failed' }))
    await tick()
    request.offer('B', true)
    assert.equal(view(request).error, false)

    request.reveal(() => Promise.resolve({ kind: 'failed' }))
    await tick()
    assert.equal(view(request).error, true)
    request.reset()
    assert.equal(view(request).error, false)
  })

  it('同じ店の offer は、hidden と chip の間だけ eligible に合わせて直す(取得中・結果は動かさない)', async () => {
    const request = createJapaneseNameRequest()
    request.offer('A', false)
    request.offer('A', true)
    assert.equal(view(request).phase, 'chip')
    request.offer('A', false)
    assert.equal(view(request).phase, 'hidden')
    request.offer('A', true)
    const d = deferred()
    request.reveal(() => d.promise)
    request.offer('A', false)
    assert.equal(view(request).phase, 'loading')
    d.resolve(NAME)
    await tick()
    request.offer('A', false)
    assert.equal(view(request).phase, 'name')
  })

  it('状態が変わると購読者を呼び、snapshot は変わるまで同じ object', async () => {
    const request = createJapaneseNameRequest()
    let notified = 0
    const off = request.subscribe(() => {
      notified += 1
    })
    const before = request.snapshot()
    assert.equal(request.snapshot(), before)
    request.offer('A', true)
    assert.equal(notified, 1)
    const d = deferred()
    request.reveal(() => d.promise)
    assert.equal(notified, 2)
    d.resolve(NAME)
    await tick()
    assert.equal(notified, 3)
    assert.notEqual(request.snapshot(), before)
    off()
    request.reset()
    assert.equal(notified, 3)
  })
})

describe('JN-10b japaneseNameStateFor(hook が返す状態の決め方)', () => {
  it('snapshot が A(name)・今の店が B → B が eligible なら chip・そうでなければ hidden(A の名前を出さない)', () => {
    const snapshot = { placeId: 'A', phase: 'name', text: 'えー', error: false }
    assert.deepEqual(japaneseNameStateFor(true, snapshot, 'B'), { phase: 'chip', text: null, error: false })
    assert.deepEqual(japaneseNameStateFor(false, snapshot, 'B'), { phase: 'hidden', text: null, error: false })
  })

  it('snapshot が A の失敗(error true)・今の店が B → B は chip で error false', () => {
    const snapshot = { placeId: 'A', phase: 'chip', text: null, error: true }
    assert.deepEqual(japaneseNameStateFor(true, snapshot, 'B'), { phase: 'chip', text: null, error: false })
  })

  it('店が無い(null)→ hidden', () => {
    const snapshot = { placeId: 'A', phase: 'chip', text: null, error: false }
    assert.deepEqual(japaneseNameStateFor(true, snapshot, null), { phase: 'hidden', text: null, error: false })
  })

  it('同じ店 → snapshot の値(取得中も届いた後も失敗も)', () => {
    assert.deepEqual(japaneseNameStateFor(true, { placeId: 'A', phase: 'loading', text: null, error: false }, 'A'), {
      phase: 'loading',
      text: null,
      error: false,
    })
    assert.deepEqual(japaneseNameStateFor(true, { placeId: 'A', phase: 'name', text: 'えー', error: false }, 'A'), {
      phase: 'name',
      text: 'えー',
      error: false,
    })
    assert.deepEqual(japaneseNameStateFor(true, { placeId: 'A', phase: 'chip', text: null, error: true }, 'A'), {
      phase: 'chip',
      text: null,
      error: true,
    })
  })
})
