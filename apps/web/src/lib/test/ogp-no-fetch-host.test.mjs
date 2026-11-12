// OG-N1〜OG-N4: 出典のタイトルを取りに行かないホスト(Instagram)の判定と、fetchOgTitle への配線(harema#139 受入条件 7)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { isNoFetchHost } from '../ogp/no-fetch-host.ts'

const hostOf = (url) => new URL(url).hostname

describe('isNoFetchHost', () => {
  it('OG-N1 instagram.com とその下の名前は取りに行かない', () => {
    for (const url of [
      'https://instagram.com/p/abc/',
      'https://www.instagram.com/reel/C0abc/',
      'http://www.instagram.com/fuglenasakusa',
      'https://help.instagram.com/',
      'https://a.b.instagram.com/',
      'https://www.instagram.com:8443/p/abc/',
    ]) {
      assert.equal(isNoFetchHost(hostOf(url)), true, url)
    }
  })

  it('OG-N2 大文字・末尾の . も同じに扱う', () => {
    assert.equal(hostOf('https://WWW.INSTAGRAM.COM/p/abc/'), 'www.instagram.com')
    assert.equal(hostOf('https://www.instagram.com./p/abc/'), 'www.instagram.com.')
    for (const host of ['INSTAGRAM.COM', 'Www.Instagram.Com', 'instagram.com.', 'www.instagram.com.', 'WWW.INSTAGRAM.COM.', 'instagram.com..']) {
      assert.equal(isNoFetchHost(host), true, host)
    }
    // 全角の名前は URL の解釈で ASCII に畳まれる
    assert.equal(isNoFetchHost(hostOf('https://ｉｎｓｔａｇｒａｍ.com/p/abc/')), true)
  })

  it('OG-N3 似た名前・別のホストは止めない', () => {
    for (const url of [
      'https://notinstagram.com/p/abc/',
      'https://instagram.com.evil.example/p/abc/',
      'https://instagram.com.evil.example./p/abc/',
      'https://instagram.co/',
      'https://instagramcom/',
      'https://com/',
      'https://example.com/instagram.com',
      'https://example.com/?u=https://www.instagram.com/',
      'https://instagram.com@evil.example/',
      'https://tabelog.com/tokyo/A1301/',
    ]) {
      assert.equal(isNoFetchHost(hostOf(url)), false, url)
    }
    assert.equal(isNoFetchHost(''), false)
    assert.equal(isNoFetchHost('.'), false)
  })
})

describe('fetchOgTitle への配線', () => {
  it('OG-N4 外へ出る前(requestHtml の前)に isNoFetchHost で null を返す', () => {
    const source = readFileSync(new URL('../ogp/fetch-og-title.ts', import.meta.url), 'utf8')
    const body = source.slice(source.indexOf('export async function fetchOgTitle('))
    const guard = body.indexOf('if (isNoFetchHost(url.hostname)) return null')
    const request = body.indexOf('await requestHtml(url)')
    assert.ok(guard > 0, '判定の行が fetchOgTitle の中に無い')
    assert.ok(request > guard, '判定が外への取得より後ろにある')
    assert.equal(body.split('requestHtml(').length - 1, 1, '外への取得の呼び出しは 1 つ')
  })
})
