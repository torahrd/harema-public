// robots.txt と sitemap.xml が LP を先に出す間も届くこと、載せる道が公開ページだけであること。
// 実際の応答は、HAREMA_LP_ONLY=1 で build した next start に curl で確かめる(PR の記録)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { LP_ONLY_SOURCE } from '../lp-only.ts'
import { PUBLIC_ANALYTICS_PATHS, PUBLIC_INDEXABLE_PATHS, SITE_ORIGIN, otherLanguagePath, publicAlternates } from '../site.ts'

// next.config の redirects と同じ形(path-to-regexp の `:path(...)`)を、先頭の `/` を付けて照らす。
const lpOnlyRedirected = (p) => new RegExp(`^/${LP_ONLY_SOURCE.slice('/:path('.length, -1)}$`).test(p)

describe('検索エンジン向けの公開の道', () => {
  it('出どころは harema.app の apex(https・末尾の / なし)', () => {
    assert.equal(SITE_ORIGIN, 'https://harema.app')
  })
  it('robots.txt と sitemap.xml は LP を先に出す間も Coming soon へ送られない', () => {
    for (const p of ['/robots.txt', '/sitemap.xml']) assert.equal(lpOnlyRedirected(p), false, p)
    assert.equal(lpOnlyRedirected('/login'), true)
  })
  it('サイトマップに載せる道は、LP を先に出す間も送られない公開ページだけ', () => {
    assert.deepEqual([...PUBLIC_INDEXABLE_PATHS], ['/', '/terms', '/privacy', '/news', '/en', '/en/terms', '/en/privacy', '/en/news'])
    for (const p of PUBLIC_INDEXABLE_PATHS) assert.equal(lpOnlyRedirected(p), false, p)
  })
  it('計測の道は索引の道をすべて含む', () => {
    for (const p of PUBLIC_INDEXABLE_PATHS) assert.ok(PUBLIC_ANALYTICS_PATHS.includes(p), p)
  })
})

const JA_EN = [['/', '/en'], ['/news', '/en/news'], ['/terms', '/en/terms'], ['/privacy', '/en/privacy']]
const readApp = (rel) => readFileSync(new URL(`../../app/${rel}`, import.meta.url), 'utf8')

describe('公開ページの言語の対(切り替えのリンクと hreflang)', () => {
  it('相手の言語の URL は 4 組を両向きに返す', () => {
    for (const [ja, en] of JA_EN) {
      assert.equal(otherLanguagePath(ja), en)
      assert.equal(otherLanguagePath(en), ja)
    }
  })
  it('対に無い道は null(外のサイトへ飛ばす道を作らない)', () => {
    for (const p of ['/about', '/coming-soon', '/share', '/login', '//evil.example', '/en/../x', 'https://evil.example', '/en/about', '/en/', '', '/terms/', '/EN']) assert.equal(otherLanguagePath(p), null, p)
  })
  it('8 道のそれぞれで canonical は自分の道・languages は ja・en・x-default(日本語の道)', () => {
    for (const [ja, en] of JA_EN) {
      for (const path of [ja, en]) {
        assert.deepEqual(publicAlternates(path), { canonical: path, languages: { ja, en, 'x-default': ja } }, path)
      }
    }
  })
  it('対に無い道の alternates は投げる(頁の書き間違いで build が止まる)', () => {
    for (const p of ['/about', '/login', '/en/about']) assert.throws(() => publicAlternates(p), p)
  })
  it('公開 8 頁の page.tsx は自分の道を publicAlternates に渡し、canonical・languages を直書きしない', () => {
    const pages = [['(site)/page.tsx', '/'], ['(site)/news/page.tsx', '/news'], ['(site)/terms/page.tsx', '/terms'], ['(site)/privacy/page.tsx', '/privacy'], ['en/page.tsx', '/en'], ['en/news/page.tsx', '/en/news'], ['en/terms/page.tsx', '/en/terms'], ['en/privacy/page.tsx', '/en/privacy']]
    for (const [page, path] of pages) {
      const src = readApp(page)
      assert.ok(src.includes(`publicAlternates('${path}')`), `${page} が publicAlternates('${path}') を呼んでいない`)
      assert.doesNotMatch(src, /canonical\s*:|languages\s*:|hreflang/, `${page} に alternates の値が直書きされている`)
    }
  })
  it('sitemap は索引の道の表だけから作る(日本語の道の直書きをしない)', () => {
    const src = readApp('sitemap.ts')
    assert.match(src, /PUBLIC_INDEXABLE_PATHS\.map\(/)
    assert.doesNotMatch(src, /['"]\/terms['"]/)
  })
})
