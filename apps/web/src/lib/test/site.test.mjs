// robots.txt と sitemap.xml が LP を先に出す間も届くこと、載せる道が公開ページだけであること。
// 実際の応答は、HAREMA_LP_ONLY=1 で build した next start に curl で確かめる(PR の記録)。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LP_ONLY_SOURCE } from '../lp-only.ts'
import { PUBLIC_INDEXABLE_PATHS, SITE_ORIGIN } from '../site.ts'

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
    assert.deepEqual([...PUBLIC_INDEXABLE_PATHS], ['/', '/terms', '/privacy'])
    for (const p of PUBLIC_INDEXABLE_PATHS) assert.equal(lpOnlyRedirected(p), false, p)
  })
})
