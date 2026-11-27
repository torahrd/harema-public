// 0 時ちょうどの切り替え(lists-policy PR-B): プライバシーポリシーの本文と更新情報の文を、サーバの時刻で選ぶ。
//   (1) legal-switch.ts: 効力発生の日時の 1 ミリ秒前は掲示の間の本文・その瞬間は効力発生の後の本文(日本語・英語)
//   (2) news.ts: after を持つ件は、after.at の 1 ミリ秒前は元の文・その瞬間は after の文
//   (3) 日時の写し(LEGAL_REVISIONS の最新の行・news.ts の after.at・DB の行)が同じ瞬間
//   (4) 4 つの頁と LP が、要求ごとに描く(requestTime() = await connection() の後の Date.now())・時刻を渡す・ISR(revalidate)を持たない
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { LEGAL_REVISIONS } from '@harema/shared/constants'
import { privacy, privacyEn, privacyPosting, privacyPostingEn } from '../../app/_public/legal.ts'
import { isPrivacyEffective, privacyDocument, privacyEffectiveAt } from '../../app/_public/legal-switch.ts'
import { NEWS, newsPhrases, newsText, noticeNewsItem } from '../../app/_public/news.ts'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
// 2026-11-29 0 時 JST の 1 秒前(23:59:59)と、その瞬間(0:00:00)
const AT = Date.parse('2026-11-28T15:00:00Z')
const JST_23_59_59 = Date.parse('2026-11-29T23:59:59+09:00') - 24 * 3600 * 1000
const JST_00_00_00 = Date.parse('2026-11-29T00:00:00+09:00')

describe('T-B1 プライバシーポリシーの本文は、効力発生の日時の瞬間に切り替わる', () => {
  it('効力発生の日時は 2026-11-29 午前 0 時(日本標準時)で、最新の改定の行の値', () => {
    assert.equal(Date.parse(privacyEffectiveAt()), AT)
    assert.equal(JST_00_00_00, AT)
    assert.equal(JST_23_59_59, AT - 1000)
    const latest = LEGAL_REVISIONS.privacy[LEGAL_REVISIONS.privacy.length - 1]
    assert.equal(latest.version, 4)
    assert.equal(latest.effectiveAt, privacyEffectiveAt())
  })

  it('23:59:59(前日)・23:59:59.999 は掲示の間の本文(日本語・英語)', () => {
    for (const now of [JST_23_59_59, AT - 1, AT - 1000 * 3600 * 24 * 3]) {
      assert.equal(isPrivacyEffective(now), false)
      assert.equal(privacyDocument('ja', now), privacyPosting)
      assert.equal(privacyDocument('en', now), privacyPostingEn)
    }
  })

  it('0:00:00(その瞬間)とその後は、効力発生の後の本文(日本語・英語)', () => {
    for (const now of [JST_00_00_00, AT + 1, AT + 1000 * 3600 * 24 * 30]) {
      assert.equal(isPrivacyEffective(now), true)
      assert.equal(privacyDocument('ja', now), privacy)
      assert.equal(privacyDocument('en', now), privacyEn)
    }
  })

  it('2 つの本文は別物: 掲示の間は冒頭に改定のお知らせと最終改定日 2026.11.22・後は掲示なしで最終改定日 2026.11.29', () => {
    assert.equal(privacyPosting.revisedOn, '2026.11.22')
    assert.equal(privacyPostingEn.revisedOn, '2026.11.22')
    assert.equal(privacy.revisedOn, '2026.11.29')
    assert.equal(privacyEn.revisedOn, '2026.11.29')
    const joined = (doc) => JSON.stringify(doc.preamble)
    assert.match(joined(privacyPosting), /改定のお知らせ/)
    assert.match(joined(privacyPostingEn), /Notice of revision/)
    assert.doesNotMatch(joined(privacy), /改定のお知らせ/)
    assert.doesNotMatch(joined(privacyEn), /Notice of revision/)
  })

  it('効力発生の後の本文だけが、第 1 条(4)にリストを持ち、掲示の間の本文は持たない(第 1 条の項目として)', () => {
    const items = (doc) => JSON.stringify(doc.articles.find((a) => a.no === 1))
    assert.match(items(privacy), /リストに入れた店/)
    assert.match(items(privacyEn), /Places in lists/)
    assert.doesNotMatch(items(privacyPosting), /リストに入れた店/)
    assert.doesNotMatch(items(privacyPostingEn), /Places in lists/)
  })
})

describe('T-B2 更新情報の文は、適用の日時の瞬間に切り替わる', () => {
  const item = NEWS.find((n) => n.after)
  it('after を持つ件は 1 つだけで、日付 2026.11.25・題「プライバシーポリシーなどの改定」(窓口の直し PR #228 で題を改めた)', () => {
    assert.equal(NEWS.filter((n) => n.after).length, 1)
    assert.ok(item)
    assert.equal(item.date, '2026.11.25')
    assert.equal(item.title, 'プライバシーポリシーなどの改定')
  })

  it('after.at は効力発生の日時と同じ瞬間', () => {
    assert.equal(Date.parse(item.after.at), AT)
    assert.equal(Date.parse(item.after.at), Date.parse(privacyEffectiveAt()))
  })

  it('文の数は元と同じ(日本語・英語)・3 つ目の文だけが変わる', () => {
    assert.equal(item.after.texts.length, item.texts.length)
    assert.equal(item.after.en.texts.length, item.en.texts.length)
    for (const [a, b] of [[item.after.texts, item.texts], [item.after.en.texts, item.en.texts]]) {
      assert.deepEqual(a.slice(0, 2), b.slice(0, 2))
      assert.notEqual(a[2], b[2])
      assert.deepEqual(a.slice(3), b.slice(3))
    }
  })

  it('前(23:59:59・1 ミリ秒前)は元の文(冒頭に掲載)・その瞬間からは after の文(本文に反映)', () => {
    for (const now of [JST_23_59_59, AT - 1]) {
      assert.deepEqual(newsText(item, 'ja', now).texts, item.texts)
      assert.deepEqual(newsText(item, 'en', now).texts, item.en.texts)
      assert.match(newsText(item, 'ja', now).texts[2], /ページの冒頭に/)
    }
    for (const now of [JST_00_00_00, AT + 1]) {
      assert.deepEqual(newsText(item, 'ja', now).texts, item.after.texts)
      assert.deepEqual(newsText(item, 'en', now).texts, item.after.en.texts)
      assert.match(newsText(item, 'ja', now).texts[2], /本文に反映しています/)
      assert.match(newsText(item, 'en', now).texts[2], /reflected in the body/)
    }
  })

  it('after を持たない件は、時刻によらず元の文', () => {
    const plain = NEWS.find((n) => !n.after)
    for (const now of [0, AT - 1, AT, AT + 1e12]) {
      assert.deepEqual(newsText(plain, 'ja', now).texts, plain.texts)
      assert.deepEqual(newsText(plain, 'en', now).texts, plain.en.texts)
    }
  })

  it('after の文は、日本語に「/」の印を持ってよく、英語には持たない・英語は「.」で終わる', () => {
    for (const text of item.after.en.texts) {
      assert.ok(!text.includes('/'))
      assert.ok(text.endsWith('.'))
    }
  })
})

describe('T-B2b 改定のお知らせの枠に出す件(notice)は、最新のポリシーの改定の適用の日と同じ', () => {
  const latest = LEGAL_REVISIONS.privacy[LEGAL_REVISIONS.privacy.length - 1]
  // 適用の日(日本標準時の暦日)= DB の notice_effective_on と同じ YYYY.MM.DD
  const effectiveOn = new Date(Date.parse(latest.effectiveAt) + 9 * 3600 * 1000).toISOString().slice(0, 10).replaceAll('-', '.')
  const withNotice = NEWS.filter((n) => n.notice !== undefined)

  it('notice を持つ件は 1 つだけで、値は最新のポリシーの行の適用の日(JST)と同じ', () => {
    assert.equal(withNotice.length, 1)
    assert.equal(withNotice[0].notice, effectiveOn)
    assert.equal(effectiveOn, '2026.11.29')
    assert.equal(effectiveOn, latest.revisedOn)
  })
  it('その件は after を持ち(適用の後は「本文に反映しています」の文が枠に出る)、after.at は適用の日時と同じ', () => {
    assert.ok(withNotice[0].after)
    assert.equal(Date.parse(withNotice[0].after.at), Date.parse(latest.effectiveAt))
  })
  it('noticeNewsItem は適用の日でその件を引き、無い日は null(枠を出さない)', () => {
    assert.equal(noticeNewsItem(effectiveOn), withNotice[0])
    assert.equal(noticeNewsItem('2000.01.01'), null)
    const shown = newsText(noticeNewsItem(effectiveOn), 'ja', AT)
    assert.equal(shown.title, 'プライバシーポリシーなどの改定')
    assert.match(shown.texts[2], /本文に反映しています/)
  })
  it('1 文目は、折ってよい位置の印「/」を除くと元の文のまま(日付と「午前」の間の空白を落とさない)', () => {
    const plain = '2026.11.29 午前 0 時(日本標準時)からプライバシーポリシーを改定します。'
    for (const texts of [withNotice[0].texts, withNotice[0].after.texts]) {
      assert.equal(newsPhrases(texts[0]).join(''), plain)
    }
  })
})

describe('T-B3 4 つの頁と LP は、要求ごとに描き、時刻を渡す(ISR を使わない)', () => {
  const pages = [
    ['(site)/privacy', 'PrivacyView', 'ja'],
    ['en/privacy', 'PrivacyView', 'en'],
    ['(site)/news', 'NewsView', 'ja'],
    ['en/news', 'NewsView', 'en'],
    ['(site)', 'HomeView', 'ja'],
    ['en', 'HomeView', 'en'],
  ]
  for (const [dir, view, locale] of pages) {
    it(`${dir}/page.tsx: async・requestTime()・${view} に now・revalidate なし`, () => {
      const src = read(`../../app/${dir}/page.tsx`)
      assert.match(src, /import \{ requestTime \} from '@\/app\/_public\/request-time'/)
      assert.match(src, /export default async function /)
      const got = src.indexOf('const now = await requestTime()')
      const render = src.search(new RegExp(`<${view}\\s+locale="${locale}"\\s+now=\\{now\\}\\s*/>`))
      assert.ok(got > 0 && render > got, 'requestTime() の後に描く')
      assert.doesNotMatch(src, /revalidate|force-static|generateStaticParams|Date\.now/)
    })
  }

  it('requestTime は await connection() の後に Date.now() を返す(静的に作らせない)', () => {
    const src = read('../../app/_public/request-time.ts').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.match(src, /import \{ connection \} from 'next\/server'/)
    const c = src.indexOf('await connection()')
    const n = src.indexOf('return Date.now()')
    assert.ok(c > 0 && n > c)
  })

  it('本体(document-view・home-view)は now を受け取り、newsText・privacyDocument に渡す。時計は読まない', () => {
    const doc = read('../../app/_public/document-view.tsx')
    assert.match(doc, /export function PrivacyView\(\{ locale, now \}/)
    assert.match(doc, /privacyDocument\(locale, now\)/)
    assert.match(doc, /newsText\(item, locale, now\)/)
    const home = read('../../app/_public/home-view.tsx')
    assert.match(home, /export function HomeView\(\{ locale, now \}/)
    assert.match(home, /newsText\(item, locale, now\)/)
    assert.doesNotMatch(doc, /Date\.now\(\)|new Date\(/)
    assert.doesNotMatch(home.replace(/\/\/.*$/gm, ''), /Date\.now\(\)/)
  })
})
