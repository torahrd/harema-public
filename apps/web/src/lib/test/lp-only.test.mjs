// LP を先に出す間の行き先の付け替え。道ごとの実際の 307 は、HAREMA_LP_ONLY=1 で build した next start に curl で確かめる(PR の記録)。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMING_SOON_PATH, isLpOnly, lpOnlyRedirects } from '../lp-only.ts'

describe('LP を先に出す間の行き先の付け替え', () => {
  it('HAREMA_LP_ONLY が 1 のときだけ付け替える', () => {
    assert.equal(isLpOnly({ HAREMA_LP_ONLY: '1' }), true)
    for (const v of [undefined, '', '0', 'true', ' 1']) assert.equal(isLpOnly({ HAREMA_LP_ONLY: v }), false)
    assert.deepEqual(lpOnlyRedirects({}), [])
  })
  it('付け替えは一時的(307)で、行き先は Coming soon のページ', () => {
    const [r, ...rest] = lpOnlyRedirects({ HAREMA_LP_ONLY: '1' })
    assert.equal(rest.length, 0)
    assert.equal(r.destination, COMING_SOON_PATH)
    assert.equal(r.permanent, false)
  })
})
