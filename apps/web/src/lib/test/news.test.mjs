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
    assert.match(read('../../app/page.tsx'), sliceRe)
    assert.match(read('../../app/news/page.tsx'), mapRe)
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
    const fixture = read('../../app/terms/page.tsx')
    const src = read('../../app/news/page.tsx')
    const res = [
      [/<SiteHeader\s*\/>/, '<SiteHeader />'],
      [/<BackToTop\s*\/>/, '<BackToTop />'],
      [/className="caption-lead"/, 'className="caption-lead"'],
      [/<SiteFooter\s+page="news"\s*\/>/, '<SiteFooter page="terms" />'.replace('terms', 'news')],
      [/<SiteAnalytics\s*\/>/, '<SiteAnalytics />'],
    ]
    for (const [re, sample] of res) {
      checked(re, sample, String(re))
      assert.match(src, re)
    }
    // 型の元(/terms)も同じ部品を持つ(fixture が今の公開ページの写しであること)
    for (const re of [/<SiteHeader\s*\/>/, /<BackToTop\s*\/>/, /className="caption-lead"/, /<SiteAnalytics\s*\/>/]) assert.match(fixture, re)
    assert.doesNotMatch(src, /['"]use client['"]/)
  })
})
