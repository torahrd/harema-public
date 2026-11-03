// LR-S6 の判定(上書きの env の守り)。`next.config.ts` と `env/server.ts` が同じ関数を呼ぶ。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertNoOverridesOnVercel } from '../env-guard.ts'

describe('LR-S6 上書きの env の守り', () => {
  it('VERCEL ありで上書きがあれば失敗する(どちらか片方でも)', () => {
    assert.throws(() => assertNoOverridesOnVercel({ VERCEL: '1', FIREBASE_AUTH_ORIGIN_OVERRIDE: 'http://127.0.0.1:9100' }))
    assert.throws(() => assertNoOverridesOnVercel({ VERCEL: '1', FIREBASE_X509_URL_OVERRIDE: 'http://127.0.0.1:9100/x509' }))
    assert.throws(() =>
      assertNoOverridesOnVercel({
        VERCEL: '1',
        FIREBASE_AUTH_ORIGIN_OVERRIDE: 'http://127.0.0.1:9100',
        FIREBASE_X509_URL_OVERRIDE: 'http://127.0.0.1:9100/x509',
      }),
    )
  })

  it('例外の文に値を出さない(名前だけ)', () => {
    assert.throws(
      () => assertNoOverridesOnVercel({ VERCEL: '1', FIREBASE_AUTH_ORIGIN_OVERRIDE: 'http://value-must-not-appear' }),
      (error) => error.message.includes('FIREBASE_AUTH_ORIGIN_OVERRIDE') && !error.message.includes('value-must-not-appear'),
    )
  })

  it('上書きだけ(VERCEL 無し・空)なら起動できる / VERCEL だけでも起動できる', () => {
    assertNoOverridesOnVercel({ FIREBASE_AUTH_ORIGIN_OVERRIDE: 'http://127.0.0.1:9100' })
    assertNoOverridesOnVercel({ VERCEL: '', FIREBASE_AUTH_ORIGIN_OVERRIDE: 'http://127.0.0.1:9100' })
    assertNoOverridesOnVercel({ VERCEL: '1' })
    assertNoOverridesOnVercel({ VERCEL: '1', FIREBASE_AUTH_ORIGIN_OVERRIDE: '', FIREBASE_X509_URL_OVERRIDE: '' })
  })
})
