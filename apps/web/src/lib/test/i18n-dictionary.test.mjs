// 辞書(packages/shared/i18n/{ja,en}.ts)に抜けが無い。実行: `pnpm --filter web test`
// 鍵の集合・値が空でない・en に日本語の文字が無い・差し込みの鍵と目印が同じ。型の同形は `pnpm typecheck`(`satisfies Messages`)。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { en, ja, messages, LOCALES } from '@harema/shared/i18n'

const JA_CHAR = /[぀-ヿ一-鿿]/

/** 辞書を [鍵のパス, 値(文字列)] の並びにする。配列は添字を鍵に足す。 */
function flatten(node, prefix = '') {
  if (typeof node === 'string') return [[prefix, node]]
  if (Array.isArray(node)) return node.flatMap((v, i) => flatten(v, `${prefix}[${i}]`))
  return Object.entries(node).flatMap(([k, v]) => flatten(v, prefix === '' ? k : `${prefix}.${k}`))
}

const jaFlat = flatten(ja)
const enFlat = flatten(en)
const enMap = new Map(enFlat)

/** 折れ目の句の数が言語ごとに違う鍵(ログインの見出しとリード。つなぐと同じ文)。鍵は添字を落として比べる。 */
const PHRASES_BY_LANGUAGE = ['web.login.heading', 'web.login.lede']
const baseKey = (k) => (PHRASES_BY_LANGUAGE.some((p) => k.startsWith(`${p}[`)) ? k.replace(/\[\d+\]$/, '') : k)
const uniq = (xs) => [...new Set(xs)]

/** ICU の差し込みの鍵(`{name}`)と、rich text の目印(`<terms>`)。 */
const args = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const tags = (s) => [...s.matchAll(/<\/?(\w+)>/g)].map((m) => m[1]).sort()

describe('T4 英語の辞書に抜けが無い', () => {
  it('言語ごとの辞書が LOCALES の全部にある', () => {
    assert.deepEqual(Object.keys(messages).sort(), [...LOCALES].sort())
    assert.equal(messages.ja, ja)
    assert.equal(messages.en, en)
  })

  it('ja と en の鍵の集合(配列は長さ)が同じ', () => {
    assert.deepEqual(
      uniq(jaFlat.map(([k]) => baseKey(k))),
      uniq(enFlat.map(([k]) => baseKey(k))),
    )
  })

  it('値が空でない(ja も en も)', () => {
    for (const [k, v] of [...jaFlat, ...enFlat]) assert.ok(v.trim().length > 0, `${k} が空`)
  })

  it('en の値に日本語の文字が無い(名指しの除外だけ)', () => {
    // iOS のメニューの「言語 / Language」は、どちらの言語の画面でも同じ字(所有者の決定 2026-11-22 00:12 JST・harema#150。PLAN 12.8・T4 の除外)。
    const bilingual = new Set(['mobile.drawer.itemLanguage'])
    for (const [k, v] of enFlat) {
      if (bilingual.has(k)) continue
      assert.ok(!JA_CHAR.test(v), `en の ${k} に日本語の文字: ${v}`)
    }
    assert.equal(enMap.get('mobile.drawer.itemLanguage'), '言語 / Language')
  })

  it('ja の値には日本語の文字がある(英語の文を ja に置いていない)。言語によらない物だけ除く', () => {
    // 言語によらない値(事業者・ブランドの語)だけ、日本語の文字が無くてよい。
    const neutral = new Set(['web.placeDetail.panelWebsite', 'web.login.noteMark'])
    for (const [k, v] of jaFlat) {
      if (neutral.has(k)) continue
      assert.ok(JA_CHAR.test(v), `ja の ${k} に日本語の文字が無い: ${v}`)
    }
  })

  it('差し込みの鍵(`{name}`)と目印(`<terms>`)が ja と en で同じ', () => {
    for (const [k, v] of jaFlat) {
      if (baseKey(k) !== k) continue // 句の配列(`{ } < >` を含まないことは下で確かめる)
      const e = enMap.get(k)
      assert.ok(e !== undefined, `en に ${k} が無い`)
      assert.deepEqual(args(e), args(v), `${k} の差し込みの鍵`)
      // 句(`<ph>`)の数は言語ごとに違ってよい。ほかの目印は種類も数も同じ。
      const noPh = (s) => tags(s).filter((t) => t !== 'ph')
      assert.deepEqual(noPh(e), noPh(v), `${k} の目印`)
    }
  })

  it('ICU の引用符(半角の ASCII の ")が値に無い(next-intl は ICU で読む。英語はそろえた ’ を使う)', () => {
    for (const [k, v] of [...jaFlat, ...enFlat]) assert.ok(!v.includes("'"), `${k} に半角の '`)
  })

  it('配列の文言は ICU の書式を通さない(t.raw で読む)ので { } < > を含まない', () => {
    const arrays = (node, prefix = '') => {
      if (Array.isArray(node)) return flatten(node, prefix)
      if (typeof node === 'object' && node !== null) {
        return Object.entries(node).flatMap(([k, v]) => arrays(v, prefix === '' ? k : `${prefix}.${k}`))
      }
      return []
    }
    for (const dict of [ja, en]) {
      for (const [k, v] of arrays(dict)) assert.ok(!/[{}<>]/.test(v), `${k} に { } < >`)
    }
  })

  it('状態の注記(評価済みから戻せない)は、英語でも「行きたい」の名前をそのまま含む', () => {
    assert.ok(ja.web.saveSheet.statusRevertNote.includes(ja.savedPlaceStatus.want_to_go))
    assert.ok(en.web.saveSheet.statusRevertNote.includes(en.savedPlaceStatus.want_to_go))
  })

  it('位置情報の帯の英語は、句の末尾が通常の半角空白で終わらない(inline-block の行末で空白が消える)', () => {
    assert.ok(!en.web.map.locationBanner.denied[1].endsWith(' '))
    assert.ok(!en.web.map.locationBanner.reloadHint[0].endsWith(' '))
  })

  it('3 つの状態の日本語は決定のとおり', () => {
    assert.deepEqual(ja.savedPlaceStatus, { want_to_go: '行きたい', visit_again: 'また行きたい', no_thanks: 'もういい' })
  })

  it('3 つの状態の英語は所有者の決定のとおり(harema#150)', () => {
    assert.deepEqual(en.savedPlaceStatus, { want_to_go: 'Want to go', visit_again: 'Would go back', no_thanks: 'Not for me' })
  })
})

describe('ログインの見出し・リード・同意の 1 つ目の句(harema#150 案 1)', () => {
  it('見出しとリードの句をつなぐと、元の 1 文になる', () => {
    assert.equal(ja.web.login.heading.join(''), 'ログイン・登録')
    assert.equal(ja.web.login.lede.join(''), 'Apple か Google のアカウントで続けます。')
    assert.equal(en.web.login.heading.join(''), 'Log in or sign up')
    assert.equal(en.web.login.lede.join(''), 'Continue with your Apple or Google account.')
  })

  it('同意の 1 つ目は、`<ph>` を外すと元の文になる', () => {
    const strip = (s) => s.replace(/<\/?ph>/g, '')
    assert.equal(strip(ja.web.login.consentTerms), '<terms>利用規約</terms>と<privacy>プライバシーポリシー</privacy>に同意')
    assert.equal(
      strip(en.web.login.consentTerms),
      'I agree to the <terms>Terms of Use</terms> and <privacy>Privacy Policy</privacy>',
    )
  })
})
