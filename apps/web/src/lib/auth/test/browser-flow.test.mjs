// ブラウザ側の手順(ログイン・退会の本人の確認)の判定の核。LR-A6 の「Apple の取り消しの失敗で止まる」(ブラウザ側)と、
// LR-B2・LR-B3 の画面側の挙動(popup を閉じただけなら失敗を出さない・資格を残さない)。
// 依存をスパイにして、呼び出しの回数と順を断言する。ブラウザ・SDK・ネットワークは使わない。
// 実行: `pnpm --filter web test`(node の type stripping で browser-flow.ts を直接読む)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_NEXT_PATH,
  clientNextPath,
  isPopupCancellation,
  runReauthWithdraw,
  runSsoLogin,
} from '../browser-flow.ts'

const cancel = (code) => Object.assign(new Error(code), { code })

/** 呼ばれた順と回数を残す依存一式。`overrides` で個別に差し替える。 */
function makeDeps(overrides = {}) {
  const calls = []
  const deps = {
    signIn: async (provider) => {
      calls.push(`signIn:${provider}`)
      return { idToken: 'idt', refreshToken: 'rt', accessToken: provider === 'apple' ? 'apple-access' : 'google-access' }
    },
    postSession: async (body) => {
      calls.push(`postSession:${body.idToken}:${body.refreshToken}`)
      return { status: 200, next: '/map' }
    },
    revokeApple: async (token) => {
      calls.push(`revokeApple:${token}`)
    },
    submit: async (idToken) => {
      calls.push(`submit:${idToken}`)
      return 'done'
    },
    signOut: async () => {
      calls.push('signOut')
    },
    ...overrides,
  }
  return { deps, calls }
}

describe('popup を閉じた・二重に開いた', () => {
  it('3 つの code だけが取り消し', () => {
    assert.equal(isPopupCancellation(cancel('auth/popup-closed-by-user')), true)
    assert.equal(isPopupCancellation(cancel('auth/cancelled-popup-request')), true)
    assert.equal(isPopupCancellation(cancel('auth/user-cancelled')), true)
    assert.equal(isPopupCancellation(cancel('auth/network-request-failed')), false)
    assert.equal(isPopupCancellation(new Error('x')), false)
    assert.equal(isPopupCancellation(null), false)
    assert.equal(isPopupCancellation('auth/popup-closed-by-user'), false)
  })
})

describe('戻り先(クライアント側の念押し)', () => {
  it('/ で始まる相対パスだけを使い、それ以外は /map', () => {
    assert.equal(clientNextPath('/onboarding'), '/onboarding')
    assert.equal(clientNextPath('/places/abc?x=1'), '/places/abc?x=1')
    for (const bad of [undefined, null, 1, '', 'https://evil.example/', '//evil.example', '/\\evil.example', 'map']) {
      assert.equal(clientNextPath(bad), DEFAULT_NEXT_PATH)
    }
  })
})

describe('ログイン', () => {
  for (const provider of ['google', 'apple']) {
    it(`正: ${provider} で入る → ID トークンと更新用の鍵を /auth/session へ 1 回 → SDK の状態を消す → 完了`, async () => {
      const { deps, calls } = makeDeps()
      const outcome = await runSsoLogin(provider, deps)
      assert.deepEqual(outcome, { kind: 'done', next: '/map' })
      assert.deepEqual(calls, [`signIn:${provider}`, 'postSession:idt:rt', 'signOut'])
    })
  }

  it('正: 受付が返した戻り先(/onboarding)に従う', async () => {
    const { deps } = makeDeps({ postSession: async () => ({ status: 200, next: '/onboarding' }) })
    assert.deepEqual(await runSsoLogin('google', deps), { kind: 'done', next: '/onboarding' })
  })

  it('負: popup を閉じた → 取り消し(失敗の表示なし)・受付へ送らない・SDK の状態は作られていないので消さない', async () => {
    const { deps, calls } = makeDeps({
      signIn: async () => {
        throw cancel('auth/popup-closed-by-user')
      },
    })
    assert.deepEqual(await runSsoLogin('google', deps), { kind: 'cancelled' })
    assert.deepEqual(calls, [])
  })

  it('負: 入る段の失敗(popup の遮断・通信・拒否)→ 失敗・受付へ送らない', async () => {
    for (const code of ['auth/popup-blocked', 'auth/network-request-failed', 'auth/internal-error']) {
      const { deps, calls } = makeDeps({
        signIn: async () => {
          throw cancel(code)
        },
      })
      assert.deepEqual(await runSsoLogin('apple', deps), { kind: 'failed' }, code)
      assert.equal(calls.filter((c) => c.startsWith('postSession')).length, 0, code)
    }
  })

  it('負: 受付が 401・403・413・500 → 失敗。それでも SDK の状態は消す', async () => {
    for (const status of [400, 401, 403, 413, 500]) {
      const { deps, calls } = makeDeps({ postSession: async () => ({ status, next: null }) })
      assert.deepEqual(await runSsoLogin('google', deps), { kind: 'failed' }, String(status))
      assert.deepEqual(calls.slice(-1), ['signOut'], String(status))
    }
  })

  it('負: 受付への通信が落ちた(throw)→ 失敗。SDK の状態は消す', async () => {
    const { deps, calls } = makeDeps({
      postSession: async () => {
        throw new TypeError('fetch failed')
      },
    })
    assert.deepEqual(await runSsoLogin('google', deps), { kind: 'failed' })
    assert.deepEqual(calls, ['signIn:google', 'signOut'])
  })

  it('負: SDK の状態を消せなくても、受付が通った結果は変えない', async () => {
    const { deps } = makeDeps({
      signOut: async () => {
        throw new Error('signOut failed')
      },
    })
    assert.deepEqual(await runSsoLogin('google', deps), { kind: 'done', next: '/map' })
  })
})

describe('退会の本人の確認(LR-A6 のブラウザ側)', () => {
  it('正: Google → 入り直す → 取り消しなしで /auth/withdraw へ再認証の ID トークンを渡す → SDK の状態を消す', async () => {
    const { deps, calls } = makeDeps()
    assert.deepEqual(await runReauthWithdraw('google', deps), { kind: 'done' })
    assert.deepEqual(calls, ['signIn:google', 'submit:idt', 'signOut'])
  })

  it('正: Apple → 入り直す → access token で取り消し → その後に /auth/withdraw → SDK の状態を消す(順)', async () => {
    const { deps, calls } = makeDeps()
    assert.deepEqual(await runReauthWithdraw('apple', deps), { kind: 'done' })
    assert.deepEqual(calls, ['signIn:apple', 'revokeApple:apple-access', 'submit:idt', 'signOut'])
  })

  it('負: Apple の取り消しの失敗 → 要求を送らず止める(退会しない)', async () => {
    const { deps, calls } = makeDeps({
      revokeApple: async () => {
        throw cancel('auth/invalid-credential')
      },
    })
    assert.deepEqual(await runReauthWithdraw('apple', deps), { kind: 'failed' })
    assert.equal(calls.filter((c) => c.startsWith('submit')).length, 0)
    assert.deepEqual(calls.slice(-1), ['signOut'])
  })

  it('負: Apple で access token が取れない(null・空)→ 取り消せないので要求を送らず止める', async () => {
    for (const accessToken of [null, '']) {
      const { deps, calls } = makeDeps({
        signIn: async () => ({ idToken: 'idt', refreshToken: 'rt', accessToken }),
      })
      assert.deepEqual(await runReauthWithdraw('apple', deps), { kind: 'failed' }, String(accessToken))
      assert.equal(calls.filter((c) => c.startsWith('submit') || c.startsWith('revoke')).length, 0)
    }
  })

  it('正: Google は access token が無くても進む(取り消しは Apple だけ)', async () => {
    const { deps, calls } = makeDeps({
      signIn: async () => ({ idToken: 'idt', refreshToken: 'rt', accessToken: null }),
    })
    assert.deepEqual(await runReauthWithdraw('google', deps), { kind: 'done' })
    assert.equal(calls.filter((c) => c.startsWith('revoke')).length, 0)
  })

  it('負: popup を閉じた → 取り消し(失敗の表示なし)・何も送らない', async () => {
    const { deps, calls } = makeDeps({
      signIn: async () => {
        throw cancel('auth/popup-closed-by-user')
      },
    })
    assert.deepEqual(await runReauthWithdraw('google', deps), { kind: 'cancelled' })
    assert.deepEqual(calls, [])
  })

  it('負: 入り直しの失敗 → 失敗・何も送らない', async () => {
    const { deps, calls } = makeDeps({
      signIn: async () => {
        throw cancel('auth/popup-blocked')
      },
    })
    assert.deepEqual(await runReauthWithdraw('google', deps), { kind: 'failed' })
    assert.deepEqual(calls, [])
  })

  it('サーバの結果の写し: 401 は未ログイン・403 と 500 と通信の失敗は失敗(表示は 1 つ)・どれも SDK の状態は消す', async () => {
    const table = [
      ['unauthenticated', { kind: 'unauthenticated' }],
      ['reauth_required', { kind: 'failed' }],
      ['failed', { kind: 'failed' }],
    ]
    for (const [result, expected] of table) {
      const { deps, calls } = makeDeps({ submit: async () => result })
      assert.deepEqual(await runReauthWithdraw('google', deps), expected, result)
      assert.deepEqual(calls.slice(-1), ['signOut'], result)
    }
    const { deps } = makeDeps({
      submit: async () => {
        throw new TypeError('fetch failed')
      },
    })
    assert.deepEqual(await runReauthWithdraw('google', deps), { kind: 'failed' })
  })
})
