// アプリの画面の文言は辞書を通る(日本語の直書きが 0)。実行: `pnpm --filter web test`
// 変更の後の木を i18n-strings-list.mjs で数え、面 B(web のアプリ画面)の行が 0 件であること。
// 面 A(共有)の日本語は辞書 packages/shared/i18n/ja.ts にだけある。
// PR3 で面 C(mobile。iOS のアプリと共有の拡張)を足した。PR4 で公開ページの英語の側を足す。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { AREA, listStrings } from './i18n-strings-list.mjs'
import { privacyEn, termsEn } from '../../app/_public/legal.ts'
import { NEWS } from '../../app/_public/news.ts'
import { en as publicEn } from '../../app/_public/copy/en.ts'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const rows = listStrings(root)

// 名指しで日本語のままにする文。出どころを添える。
const EXCEPTIONS = []

// 面 C(mobile)で名指しで日本語のままにする文。
// 今は無い。iOS のログインの足の「日本語のみ」は、所有者の決定(2026-11-14・harema#150・Q3 の A)で外した。
const EXCEPTIONS_C = []

describe('T5(1) アプリの画面に日本語の直書きが無い', () => {
  it('面 B の行が、辞書と名指しの除外を除いて 0 件', () => {
    const left = rows.filter(
      ([area, file, , text]) => area === AREA.B && !EXCEPTIONS.some((x) => x.file === file && x.text === text),
    )
    assert.deepEqual(left.map((r) => r.join(' | ')), [])
  })

  it('面 C(iOS のアプリと共有の拡張)の行が、辞書と名指しの除外を除いて 0 件(日本語の直書きが無い)', () => {
    const left = rows.filter(
      ([area, file, , text]) => area === AREA.C && !EXCEPTIONS_C.some((x) => x.file === file && x.text === text),
    )
    assert.deepEqual(left.map((r) => r.join(' | ')), [])
  })

  it('面 C の名指しの除外は、今もその文がある(直したら除外を外す)', () => {
    for (const x of EXCEPTIONS_C) {
      assert.ok(
        rows.some(([area, file, , text]) => area === AREA.C && file === x.file && text === x.text),
        `除外 ${x.file} ${x.text}(${x.source})がもう無い。除外を外す`,
      )
    }
  })

  it('面 A(共有)の日本語は辞書 ja.ts にだけある', () => {
    // 言語の自称(LOCALE_NAMES の「日本語」)は訳ではなく、どの言語の画面でも同じ字で出す(locale.ts・harema#150)。
    const outside = rows.filter(
      ([area, file, , text]) =>
        area === AREA.A &&
        file !== 'packages/shared/i18n/ja.ts' &&
        !(file === 'packages/shared/i18n/locale.ts' && text === '日本語') &&
        // iOS のメニューの「言語 / Language」は、どちらの言語の画面でも同じ字なので en の辞書にも入る(i18n-dictionary の除外と同じ・harema#150)。
        !(file === 'packages/shared/i18n/en.ts' && text === '言語 / Language'),
    )
    assert.deepEqual(outside.map((r) => r.join(' | ')), [])
  })

  it('数え上げが動いている(辞書の日本語を数える)', () => {
    assert.ok(rows.filter(([area]) => area === AREA.A).length > 100)
  })

  it('(app)/login/page.tsx が戻る道の読み上げ名を辞書から渡す(_public の定数は面 D で数えない)', () => {
    const src = readFileSync(`${root}apps/web/src/app/(app)/login/page.tsx`, 'utf8')
    assert.ok(src.includes('<BackToTop label='))
  })
})

// PR4: 公開ページの英語の側(app/en・copy/en.ts・docs/legal/en・legal.ts の英語・news.ts の en)に日本語が無い。
// 面 D・E の日本語は、日本語の文を持つ所にだけある。
const JA = /[぀-ヿ一-鿿]/
const PUBLIC_JA_FILES = [
  'apps/web/src/app/_public/copy/ja.ts',
  'apps/web/src/app/_public/news.ts',
  'apps/web/src/app/_public/legal.ts',
  'apps/web/src/app/_public/linkify.tsx', // 条の見出し「第 N 条(…)」の日本語の形(英語は Article N)
  'apps/web/src/app/_public/back-to-top.tsx', // 既定の読み上げ名(英語の頁は辞書の語を渡す)
  'apps/web/src/app/_public/lp-notice-copy.ts', // 日本語の LP だけが出す知らせ
]

describe('T26(1) 公開ページの英語の側に日本語が無い', () => {
  it('面 D・E の日本語は、日本語の文を持つファイルと (site) の頁にだけある', () => {
    const outside = rows.filter(
      ([area, file]) => (area === AREA.D || area === AREA.E) && !PUBLIC_JA_FILES.includes(file) && !file.startsWith('apps/web/src/app/(site)/'),
    )
    assert.deepEqual(outside.map((r) => r.join(' | ')), [])
  })

  it('app/en と copy/en.ts に日本語の文字列が 0 件(数え上げが動いている前提で)', () => {
    assert.ok(rows.filter(([area, file]) => area === AREA.D && file === 'apps/web/src/app/_public/copy/ja.ts').length > 20)
    const enRows = rows.filter(([, file]) => file.startsWith('apps/web/src/app/en/') || file === 'apps/web/src/app/_public/copy/en.ts')
    assert.deepEqual(enRows.map((r) => r.join(' | ')), [])
  })

  it('英語の文(copy/en.ts)に日本語の文字と和文の折れの印が無い', () => {
    const strings = []
    JSON.stringify(publicEn, (_key, value) => { if (typeof value === 'string') strings.push(value); return value })
    assert.ok(strings.length > 40, `数え上げが動いていない: ${strings.length}`)
    for (const text of strings) {
      assert.doesNotMatch(text, JA, text)
      // 頁の題(`… | hareMa`)の縦線は印ではない。それ以外の文に印を使わない(英語は語の間で折れる)。
      if (!text.endsWith(' | hareMa')) assert.doesNotMatch(text, /[|⟦⟧⟨⟩⟪⟫⟮⟯]/, text)
    }
  })

  it('英訳 docs/legal/en と、生成物 legal.ts の英語 2 本に日本語の文字が無い', () => {
    for (const name of ['terms', 'privacy']) {
      assert.doesNotMatch(readFileSync(new URL(`../../../../../docs/legal/en/${name}.md`, import.meta.url), 'utf8'), JA, `docs/legal/en/${name}.md`)
    }
    assert.ok(readdirSync(new URL('../../../../../docs/legal/en/', import.meta.url)).length >= 2)
    assert.doesNotMatch(JSON.stringify(termsEn), JA)
    assert.doesNotMatch(JSON.stringify(privacyEn), JA)
  })

  it('news.ts の英語の欄に日本語の文字が無い', () => {
    for (const item of NEWS) assert.doesNotMatch(JSON.stringify(item.en), JA, item.date)
  })

  it('英語の頁の page.tsx と layout は日本語の文を直書きしない(en/**の .tsx は上の面 D の数え上げが見る)', () => {
    const enDir = new URL('../../app/en/', import.meta.url)
    const files = ['layout.tsx', 'page.tsx', 'news/page.tsx', 'terms/page.tsx', 'privacy/page.tsx', 'not-found.tsx', '[...rest]/page.tsx']
    for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, enDir), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), JA, f)
  })
})
