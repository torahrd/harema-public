// 更新情報(LP の最新 3 件と /news)のデータと組み。件の文は news.ts の 1 か所、LP と /news はそこから読む。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { LP_NEWS_COUNT, NEWS, newsDateTime, newsPhrases, newsPlain } from '../../app/_public/news.ts'

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// 正規表現は、必ず当たる fixture(今のソースの該当の行の写し)を先に照らしてから使う。0 件に化けたら落ちる。
function checked(re, fixture, label) {
  assert.match(fixture, re, `fixture が当たらない(正規表現が壊れている): ${label}`)
  return re
}

describe('更新情報', () => {
  it('件は新しい順に並ぶ', () => {
    assert.ok(NEWS.length >= LP_NEWS_COUNT)
    for (let i = 1; i < NEWS.length; i++) {
      assert.ok(NEWS[i].date <= NEWS[i - 1].date, `${i} 件目(${NEWS[i].date})が前の件(${NEWS[i - 1].date})より新しい`)
    }
  })

  it('日付は YYYY.MM.DD の実在する日・対象は Web・iPhone・Android', () => {
    for (const item of NEWS) {
      assert.match(item.date, /^\d{4}\.\d{2}\.\d{2}$/, item.date)
      const [y, m, d] = item.date.split('.').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d))
      assert.ok(dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d, `実在しない日: ${item.date}`)
      assert.equal(newsDateTime(item.date), item.date.replaceAll('.', '-'))
      assert.ok(item.targets.length > 0)
      for (const t of item.targets) assert.ok(t === 'Web' || t === 'iPhone' || t === 'Android', t)
      assert.ok(item.title.length > 0)
    }
  })

  it('説明は 1 文ずつで、句は印「/」の位置だけで切れる', () => {
    for (const item of NEWS) {
      assert.ok(item.texts.length > 0)
      for (const text of item.texts) {
        assert.equal(text.split('。').length, 2, `「。」が末尾の 1 つだけでない: ${text}`)
        assert.ok(text.endsWith('。'), text)
        const phrases = newsPhrases(text)
        phrases.forEach((p) => assert.ok(p.trim().length > 0, `空の句がある: ${text}`))
      }
    }
  })

  it('同じ日・同じ対象の組の件は 1 つにまとまっている', () => {
    const seen = new Set()
    for (const item of NEWS) {
      const k = `${item.date} ${item.targets.join()}`
      assert.ok(!seen.has(k), `同じ日・同じ対象の件が 2 つある: ${k}`)
      seen.add(k)
    }
  })

  it('LP は先頭の LP_NEWS_COUNT 件・/news は全件を、news.ts から読む', () => {
    const sliceRe = checked(/NEWS\s*\.\s*slice\(\s*0\s*,\s*LP_NEWS_COUNT\s*\)/, 'NEWS.slice(0, LP_NEWS_COUNT).map((item) =>', 'slice')
    const mapRe = checked(/NEWS\s*\.\s*map\(/, '<ol className="news-list">{NEWS.map((item) =>', 'map')
    // 本体は PR4 で _public/home-view.tsx・_public/document-view.tsx に移り、(site) と en の頁が言語を引数にして呼ぶ。
    assert.match(read('../../app/_public/home-view.tsx'), sliceRe)
    assert.match(read('../../app/_public/document-view.tsx'), mapRe)
    // 件の説明の文の全文が(題は「機能の追加」などの総称なので見ない)、news.ts 以外の .ts / .tsx に無い(直書きの二重管理をしない)
    const files = sourceFiles(SRC).filter((p) => !p.endsWith(join('_public', 'news.ts')))
    assert.ok(files.length > 50, `走査したファイルが少なすぎる: ${files.length}`)
    for (const f of files) {
      const body = readFileSync(f, 'utf8')
      for (const item of NEWS) {
        for (const text of item.texts) assert.ok(!body.includes(newsPlain(text)) && !body.includes(text), `${f} に件の text が直書きされている: ${text}`)
      }
    }
  })

  it('/news は公開ページの型', () => {
    const view = read('../../app/_public/document-view.tsx')
    const sections = Object.fromEntries(view.split('export function ').slice(1).map((part) => [part.slice(0, part.indexOf('(')), part]))
    const section = (name) => sections[name] ?? assert.fail(`${name} が document-view.tsx に無い`)
    const fixture = section('TermsView')
    const src = section('NewsView')
    const res = [
      [/<SiteHeader\s+locale=\{locale\}\s*\/>/, '<SiteHeader locale={locale} />'],
      [/<BackToTop\s+\{\.\.\.backProps\(locale\)\}\s*\/>/, '<BackToTop {...backProps(locale)} />'],
      [/className="caption-lead"/, 'className="caption-lead"'],
      [/<SiteFooter\s+page="news"\s+locale=\{locale\}\s*\/>/, '<SiteFooter page="news" locale={locale} />'],
      [/<SiteAnalytics\s*\/>/, '<SiteAnalytics />'],
    ]
    for (const [re, sample] of res) {
      checked(re, sample, String(re))
      assert.match(src, re)
    }
    // 型の元(/terms)も同じ部品を持つ(fixture が今の公開ページの写しであること)
    for (const re of [/<SiteHeader\s+locale=\{locale\}\s*\/>/, /<BackToTop\s+\{\.\.\.backProps\(locale\)\}\s*\/>/, /className="caption-lead"/, /<SiteAnalytics\s*\/>/]) assert.match(fixture, re)
    assert.doesNotMatch(view, /['"]use client['"]/)
    // 4 つの頁(日本語・英語)が同じ本体を呼ぶ
    for (const [page, view_] of [['(site)/news', 'NewsView'], ['en/news', 'NewsView']]) {
      assert.match(read(`../../app/${page}/page.tsx`), new RegExp(`<${view_}\\s+locale="${page.startsWith('en') ? 'en' : 'ja'}"`))
    }
  })

  it('全件に英語の題と文があり、文の数は日本語と同じ(T25)', () => {
    for (const item of NEWS) {
      assert.ok(item.en && item.en.title.length > 0, `${item.date} に en.title が無い`)
      assert.equal(item.en.texts.length, item.texts.length, `${item.date} ${item.title}: 英語の文の数が日本語と違う`)
      for (const text of item.en.texts) {
        assert.ok(text.length > 0)
        assert.ok(text.endsWith('.'), `英語の文が「.」で終わらない: ${text}`)
        assert.ok(!text.includes('/'), `英語の文に「/」の印がある: ${text}`)
        assert.doesNotMatch(text, /[぀-ヿ一-鿿]/, `英語の文に日本語がある: ${text}`)
      }
      assert.doesNotMatch(item.en.title, /[぀-ヿ一-鿿/]/, item.en.title)
    }
  })

  it('英語の文は news.ts 以外の .ts / .tsx に直書きされていない', () => {
    // _public/legal.ts はポリシーの本文の生成物で、改定のお知らせが更新情報と同じ英語の文を持ちうる。
    const files = sourceFiles(SRC).filter((p) => !p.endsWith(join('_public', 'news.ts')) && !p.endsWith(join('_public', 'legal.ts')))
    for (const f of files) {
      const body = readFileSync(f, 'utf8')
      for (const item of NEWS) for (const text of item.en.texts) assert.ok(!body.includes(text), `${f} に英語の件の text が直書きされている: ${text}`)
    }
  })
})
