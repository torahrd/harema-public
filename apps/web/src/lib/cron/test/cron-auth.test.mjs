// T-W1: 定期の取り直しの口の照合(CRON_SECRET)。
// 実行: `pnpm --filter web test`(node の type stripping で cron-auth.ts を直接読む)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAuthorizedCronRequest } from '../cron-auth.ts'

const SECRET = 'a'.repeat(32)

describe('isAuthorizedCronRequest', () => {
  it('正しい Bearer <32 文字> は true', () => {
    assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET), true)
  })
  it('違う値は false', () => {
    assert.equal(isAuthorizedCronRequest(`Bearer ${'b'.repeat(32)}`, SECRET), false)
  })
  it('同じ前置きで長い値は false', () => {
    assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET), false)
  })
  it('bearer の小文字は false', () => {
    assert.equal(isAuthorizedCronRequest(`bearer ${SECRET}`, SECRET), false)
  })
  it('前後の空白は false', () => {
    assert.equal(isAuthorizedCronRequest(` Bearer ${SECRET}`, SECRET), false)
    assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET} `, SECRET), false)
  })
  it('Bearer の前置きが無い値・header なしは false', () => {
    assert.equal(isAuthorizedCronRequest(SECRET, SECRET), false)
    assert.equal(isAuthorizedCronRequest(null, SECRET), false)
  })
  it('secret が undefined・空・31 文字なら、正しい形の header でも false', () => {
    assert.equal(isAuthorizedCronRequest('Bearer undefined', undefined), false)
    assert.equal(isAuthorizedCronRequest('Bearer ', ''), false)
    const short = 'c'.repeat(31)
    assert.equal(isAuthorizedCronRequest(`Bearer ${short}`, short), false)
  })
})
