// ログアウト・退会の後の LP の知らせ(合図は sessionStorage・1 回だけ・60 秒で無効)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { LP_NOTICE_KEY, LP_NOTICE_MAX_AGE_MS, clearLpNotice, markLpNotice, takeLpNotice } from '../lp-notice.ts'
import { LP_NOTICE_LINES } from '../../app/_public/lp-notice-copy.ts'

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  }
}
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const NOW = 1_000_000

describe('LP の知らせの合図', () => {
  it('ログアウトの印を置いて読むと logout が返り、読んだら印は消える', () => {
    const s = fakeStorage()
    markLpNotice('logout', () => s, NOW)
    assert.ok(s.m.has(LP_NOTICE_KEY))
    assert.equal(takeLpNotice(() => s, NOW + 1000), 'logout')
    assert.equal(s.m.has(LP_NOTICE_KEY), false)
  })
  it('退会の印を置いて読むと withdraw が返る', () => {
    const s = fakeStorage()
    markLpNotice('withdraw', () => s, NOW)
    assert.equal(takeLpNotice(() => s, NOW), 'withdraw')
  })
  it('印が無い・形が違う・知らない種類・60 秒を超えた・未来の時刻なら null で、印は消す', () => {
    assert.equal(takeLpNotice(() => fakeStorage(), NOW), null)
    const bad = [
      'not json',
      'null',
      '"logout"',
      '[]',
      JSON.stringify({ k: 'logout' }),
      JSON.stringify({ k: 'logout', t: 'x' }),
      JSON.stringify({ k: 'logout', t: null }),
      JSON.stringify({ k: 'other', t: NOW }),
      JSON.stringify({ k: 1, t: NOW }),
      JSON.stringify({ k: 'logout', t: NOW - LP_NOTICE_MAX_AGE_MS - 1 }),
      JSON.stringify({ k: 'logout', t: NOW + 1 }),
    ]
    for (const raw of bad) {
      const s = fakeStorage({ [LP_NOTICE_KEY]: raw })
      assert.equal(takeLpNotice(() => s, NOW), null, raw)
      assert.equal(s.m.has(LP_NOTICE_KEY), false, raw)
    }
    const edge = fakeStorage({ [LP_NOTICE_KEY]: JSON.stringify({ k: 'logout', t: NOW - LP_NOTICE_MAX_AGE_MS }) })
    assert.equal(takeLpNotice(() => edge, NOW), 'logout')
  })
  it('storage の取り出し・getItem・setItem・removeItem が投げても、投げずに null か何もしない', () => {
    const boom = () => { throw new Error('x') }
    assert.equal(takeLpNotice(boom, NOW), null)
    assert.doesNotThrow(() => markLpNotice('logout', boom, NOW))
    const g = { getItem: boom, setItem: boom, removeItem: boom }
    assert.equal(takeLpNotice(() => g, NOW), null)
    assert.doesNotThrow(() => markLpNotice('logout', () => g, NOW))
    const r = { ...fakeStorage({ [LP_NOTICE_KEY]: JSON.stringify({ k: 'logout', t: NOW }) }), removeItem: boom }
    assert.equal(takeLpNotice(() => r, NOW), 'logout')
  })
  it('2 回目の読みは null(1 回だけ)', () => {
    const s = fakeStorage()
    markLpNotice('logout', () => s, NOW)
    assert.equal(takeLpNotice(() => s, NOW), 'logout')
    assert.equal(takeLpNotice(() => s, NOW), null)
  })
  it('文言はログアウトが「ログアウトしました。」、退会が「退会しました。」「ご利用ありがとうございました。」の 2 文', () => {
    assert.deepEqual([...LP_NOTICE_LINES.logout], ['ログアウトしました。'])
    assert.deepEqual([...LP_NOTICE_LINES.withdraw], ['退会しました。', 'ご利用ありがとうございました。'])
  })
  it('ログアウトは呼ぶ前に logout の印を置き、失敗(ok:false・例外)で消し、成功の移動はサーバの redirect に任せる', () => {
    const src = read('../../app/account/drawer.tsx')
    assert.equal(src.split("markLpNotice('logout')").length - 1, 1)
    assert.equal(src.split('clearLpNotice()').length - 1, 1)
    const iMark = src.indexOf("markLpNotice('logout')")
    const iCall = src.indexOf('await signOut()')
    const iRethrow = src.indexOf('unstable_rethrow(error)')
    const iClear = src.indexOf('clearLpNotice()')
    const iFail = src.indexOf('setLogoutFailed(true)')
    assert.ok(iMark >= 0 && iMark < iCall)
    assert.ok(iRethrow >= 0 && iRethrow < iClear && iClear < iFail)
    // unstable_rethrow は catch (error) { の後の最初の文(コメント行は飛ばす)
    assert.match(src, /catch \(error\) \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*unstable_rethrow\(error\)/)
    // 印を消す行と失敗の文は catch を閉じた後(値の失敗も例外も通る所)にある
    assert.match(src, /unstable_rethrow\(error\)\s*\n(?:\s*\/\/[^\n]*\n)*\s*\}\s*\n(?:\s*\/\/[^\n]*\n)*\s*clearLpNotice\(\)\s*\n\s*setLogoutFailed\(true\)/)
    assert.equal(src.includes('location.assign'), false)
  })
  it('ログアウトの成功は cookie を消した後に LP へ replace で redirect し、try の中に置かない', () => {
    const src = read('../../app/account/actions.ts')
    const body = src.slice(src.indexOf('export async function signOut'))
    assert.match(body, /await clearSessionCookie\(\)\s*\n\s*redirect\('\/', RedirectType\.replace\)\s*\n\}/)
    assert.equal(/\btry\b/.test(body), false)
    assert.equal(body.includes('ok: true'), false)
    assert.equal(src.split("redirect('/'").length - 1, 1)
  })
  it('clearLpNotice は印を消し、storage が投げても投げない', () => {
    const s = fakeStorage()
    markLpNotice('logout', () => s, NOW)
    clearLpNotice(() => s)
    assert.equal(takeLpNotice(() => s, NOW), null)
    const boom = () => { throw new Error('x') }
    assert.doesNotThrow(() => clearLpNotice(boom))
    const r = { ...fakeStorage(), removeItem: boom }
    assert.doesNotThrow(() => clearLpNotice(() => r))
  })
  it('退会の done の枝で、router.replace の直前に withdraw の印を置き、ほかの枝には置かない', () => {
    const src = read('../../app/account/withdraw-dialog.tsx')
    assert.equal(src.split("markLpNotice('withdraw')").length - 1, 1)
    assert.match(src, /outcome\.kind === 'done'\) \{[^\n]*\n(?:[^\n]*\/\/[^\n]*\n)?\s*markLpNotice\('withdraw'\)\s*\n\s*router\.replace\('\/'\)/)
  })
  it('LP の知らせは頭の行の直後に置く', () => {
    const src = read('../../app/page.tsx')
    assert.match(src, /<\/header>\n<LpNotice \/>\n/)
  })
})
