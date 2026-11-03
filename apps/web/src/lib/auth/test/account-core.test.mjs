// LR-A5(ログアウト)・LR-A6(退会: 再認証 → 印 → Firebase → 行)・LR-A7(完了の再実行)と、Onboarding の中止(LR-B9 の判定の核)。
// 依存をスパイにして、呼び出しの回数と順を断言する。stack・ネットワークは使わない。
// 実行: `pnpm --filter web test`(node の type stripping で account-core.ts を直接読む)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  COMPLETE_ONBOARDING_MAX_ATTEMPTS,
  REAUTH_MAX_AGE_SEC,
  WITHDRAWAL_DB_MAX_ATTEMPTS,
  classifyDbFailure,
  isAccountDeleted,
  parseWithdrawRequest,
  runAbortOnboarding,
  runCompleteOnboarding,
  runLogout,
  runWithdraw,
} from '../account-core.ts'

const OK = { error: null, status: 204 }
const raised = (message) => ({ error: { code: 'P0001', message }, status: 400 })
const NOT_AUTH = raised('not authenticated')
const NO_PENDING = raised('no pending registration')
const BEING_REMOVED = raised('pending registration is being removed')
const NETWORK = { error: { message: 'fetch failed' }, status: 0 }
const SERVER_ERROR = { error: { code: '', message: 'boom' }, status: 503 }
const UNIQUE = { error: { code: '23505', message: 'duplicate key value violates unique constraint "user_agreements_pkey"' }, status: 409 }

/** 呼ばれた回数を数え、渡した結果を順に返すスパイ(尽きたら最後の結果を返し続ける)。 */
function spy(results) {
  const fn = async () => {
    fn.calls += 1
    const value = results[Math.min(fn.calls - 1, results.length - 1)]
    if (value instanceof Error) throw value
    return value
  }
  fn.calls = 0
  return fn
}
const logs = () => {
  const events = []
  const log = (event, detail) => events.push(detail ? `${event}:${detail.sub}` : event)
  log.events = events
  return log
}
const noWait = async () => {}

describe('classifyDbFailure', () => {
  it('DB の拒否の文を 3 種に分ける(P0001 のときだけ)', () => {
    assert.equal(classifyDbFailure(NOT_AUTH), 'not_authenticated')
    assert.equal(classifyDbFailure(NO_PENDING), 'no_pending')
    assert.equal(classifyDbFailure(BEING_REMOVED), 'being_removed')
    assert.equal(classifyDbFailure(raised('invalid username')), 'other')
    // P0001 以外の同じ文は拒否として扱わない
    assert.equal(classifyDbFailure({ error: { code: '23505', message: 'not authenticated' }, status: 409 }), 'other')
  })
  it('通信の失敗・時間切れ・408・429・5xx は一時の失敗、4xx は一時ではない', () => {
    for (const status of [0, 408, 429, 500, 503]) {
      assert.equal(classifyDbFailure({ error: { message: 'x' }, status }), 'transient', String(status))
    }
    for (const status of [400, 401, 403, 404, 409]) {
      assert.equal(classifyDbFailure({ error: { message: 'x' }, status }), 'other', String(status))
    }
  })
})

describe('LR-A5 ログアウト', () => {
  it('正: revoke_this_session が成功 → revoked(cookie を消してよい)', async () => {
    const revoke = spy([OK])
    assert.equal(await runLogout({ revoke, log: logs() }), 'revoked')
    assert.equal(revoke.calls, 1)
  })
  it('負: 例外・通信の失敗・時間切れ・5xx・そのほかの拒否 → failed(cookie を消さない)', async () => {
    for (const result of [new Error('boom'), NETWORK, SERVER_ERROR, { error: { message: 'x' }, status: 401 }, raised('invalid username')]) {
      const log = logs()
      assert.equal(await runLogout({ revoke: spy([result]), log }), 'failed')
      assert.deepEqual(log.events, ['logout.revoke_failed'])
    }
  })
  it('DB が「有効なログインでない」と答えたら already_invalid(止める対象が既に無い)', async () => {
    assert.equal(await runLogout({ revoke: spy([NOT_AUTH]), log: logs() }), 'already_invalid')
  })
})

describe('isAccountDeleted(Firebase の accounts:delete の応答)', () => {
  it('正: 2xx でエラーを含まない JSON のオブジェクト・USER_NOT_FOUND(既に消えている)は成功', () => {
    assert.equal(isAccountDeleted(200, { kind: 'identitytoolkit#DeleteAccountResponse' }), true)
    assert.equal(isAccountDeleted(200, {}), true)
    assert.equal(isAccountDeleted(400, { error: { code: 400, message: 'USER_NOT_FOUND' } }), true)
  })
  it('負: そのほかの失敗は成功に数えない(別のエラー名・2xx でも error を含む・解釈できない本体・5xx)', () => {
    assert.equal(isAccountDeleted(400, { error: { code: 400, message: 'INVALID_ID_TOKEN' } }), false)
    assert.equal(isAccountDeleted(400, { error: { code: 400, message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } }), false)
    assert.equal(isAccountDeleted(200, { error: { message: 'USER_NOT_FOUND' } }), false)
    assert.equal(isAccountDeleted(500, { error: { message: 'USER_NOT_FOUND_X' } }), false)
    assert.equal(isAccountDeleted(503, {}), false)
    assert.equal(isAccountDeleted(400, { error: 'USER_NOT_FOUND' }), false)
    for (const body of [null, undefined, 'USER_NOT_FOUND', 1, []]) {
      assert.equal(isAccountDeleted(200, body), false)
      assert.equal(isAccountDeleted(400, body), false)
    }
  })
})

describe('LR-A6 退会(再認証 → 印 → Firebase → 行)', () => {
  const goodVerdict = { ok: true, sub: 'lr-a-a6-1' }
  const deps = (overrides = {}) => ({
    userId: 'lr-a-a6-1',
    verifyReauth: spy([goodVerdict]),
    beginWithdrawal: spy([OK]),
    firebaseDelete: spy([true]),
    finishWithdrawal: spy([OK]),
    log: logs(),
    ...overrides,
  })

  it('正: 再認証の検証(5 分の窓) → begin_withdrawal → Firebase の削除 → finish_withdrawal の順で 1 回ずつ、DB にも Firebase にも再認証のトークンを渡す', async () => {
    const order = []
    const d = deps({
      verifyReauth: async (token, age) => {
        order.push(`verify:${token}:${age}`)
        return goodVerdict
      },
      beginWithdrawal: async (token) => {
        order.push(`begin:${token}`)
        return OK
      },
      firebaseDelete: async (token) => {
        order.push(`firebase:${token}`)
        return true
      },
      finishWithdrawal: async (token) => {
        order.push(`finish:${token}`)
        return OK
      },
    })
    assert.equal(await runWithdraw('reauth-tok', d), 'done')
    assert.deepEqual(order, [
      `verify:reauth-tok:${REAUTH_MAX_AGE_SEC}`,
      'begin:reauth-tok',
      'firebase:reauth-tok',
      'finish:reauth-tok',
    ])
    assert.equal(REAUTH_MAX_AGE_SEC, 300)
    assert.equal(WITHDRAWAL_DB_MAX_ATTEMPTS, 3)
  })

  it('負: 再認証のトークンが検証を通らない(auth_time が 6 分前などを含む) → DB 0 回・Firebase 0 回', async () => {
    const d = deps({ verifyReauth: spy([{ ok: false }]) })
    assert.equal(await runWithdraw('tok', d), 'reauth_rejected')
    assert.equal(d.beginWithdrawal.calls, 0)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })
  it('負: 検証の例外も拒否として扱い、何もしない', async () => {
    const d = deps({ verifyReauth: spy([new Error('verify down')]) })
    assert.equal(await runWithdraw('tok', d), 'reauth_rejected')
    assert.equal(d.beginWithdrawal.calls, 0)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })
  it('負: 再認証の sub が cookie の sub と違う → DB 0 回・Firebase 0 回', async () => {
    const d = deps({ verifyReauth: spy([{ ok: true, sub: 'lr-a-a6-other' }]) })
    assert.equal(await runWithdraw('tok', d), 'reauth_rejected')
    assert.equal(d.beginWithdrawal.calls, 0)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })

  it('負: begin_withdrawal の失敗 → 2 回まで再試行し、なお失敗なら begin_failed(Firebase 0 回・finish 0 回)', async () => {
    const log = logs()
    const d = deps({ beginWithdrawal: spy([NETWORK, SERVER_ERROR, NOT_AUTH]), log })
    assert.equal(await runWithdraw('tok', d), 'begin_failed')
    assert.equal(d.beginWithdrawal.calls, 3)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
    assert.deepEqual(log.events, ['withdraw.begin_failed'])
  })
  it('負: begin_withdrawal が例外 → 失敗と同じに扱う', async () => {
    const d = deps({ beginWithdrawal: spy([new Error('boom')]) })
    assert.equal(await runWithdraw('tok', d), 'begin_failed')
    assert.equal(d.beginWithdrawal.calls, 3)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })
  it('正: begin_withdrawal の応答が落ちた後の再試行が成功(already_marked) → 退会を続けて完了', async () => {
    const d = deps({ beginWithdrawal: spy([NETWORK, OK]) })
    assert.equal(await runWithdraw('tok', d), 'done')
    assert.equal(d.beginWithdrawal.calls, 2)
    assert.equal(d.firebaseDelete.calls, 1)
    assert.equal(d.finishWithdrawal.calls, 1)
  })

  it('Firebase の削除の失敗(成功以外・例外) → finish_withdrawal を 0 回で完了(uid だけをログに 1 行)', async () => {
    for (const result of [false, new Error('timeout')]) {
      const log = logs()
      const d = deps({ firebaseDelete: spy([result]), log })
      assert.equal(await runWithdraw('tok', d), 'done')
      assert.equal(d.beginWithdrawal.calls, 1)
      assert.equal(d.finishWithdrawal.calls, 0)
      assert.deepEqual(log.events, ['withdraw.firebase_delete_failed:lr-a-a6-1'])
    }
  })
  it('finish_withdrawal の失敗 → 2 回まで再試行し、途中で成功すれば完了(ログなし)', async () => {
    const log = logs()
    const d = deps({ finishWithdrawal: spy([NETWORK, SERVER_ERROR, OK]), log })
    assert.equal(await runWithdraw('tok', d), 'done')
    assert.equal(d.finishWithdrawal.calls, 3)
    assert.deepEqual(log.events, [])
  })
  it('finish_withdrawal が上限の後も失敗 → 3 回で止まり、完了を返す(uid だけをログに 1 行)', async () => {
    const log = logs()
    const d = deps({ finishWithdrawal: spy([NETWORK]), log })
    assert.equal(await runWithdraw('tok', d), 'done')
    assert.equal(d.finishWithdrawal.calls, 3)
    assert.equal(d.beginWithdrawal.calls, 1)
    assert.equal(d.firebaseDelete.calls, 1)
    assert.deepEqual(log.events, ['withdraw.finish_failed:lr-a-a6-1'])
  })

  describe('受付(cookie だけでは退会できない)', () => {
    const APP = 'http://127.0.0.1:3000'
    const request = (overrides = {}) => ({
      origin: APP,
      contentType: 'application/json',
      bodyText: JSON.stringify({ idToken: 'tok' }),
      ...overrides,
    })
    it('正: 同じ Origin・JSON・idToken を持つ本文', () => {
      assert.deepEqual(parseWithdrawRequest(request(), APP), { ok: true, idToken: 'tok' })
      assert.deepEqual(parseWithdrawRequest(request({ contentType: 'application/json; charset=utf-8' }), APP), {
        ok: true,
        idToken: 'tok',
      })
    })
    it('負: 別の Origin・Origin 無し・フォームの Content-Type → 403', () => {
      for (const overrides of [
        { origin: 'https://evil.example' },
        { origin: null },
        { contentType: 'application/x-www-form-urlencoded' },
        { contentType: null },
      ]) {
        const r = parseWithdrawRequest(request(overrides), APP)
        assert.equal(r.ok, false)
        assert.equal(r.status, 403)
      }
    })
    it('負: 本文に再認証のトークンが無い(cookie だけの要求) → 400', () => {
      for (const bodyText of ['', '{}', '[]', 'null', '{"idToken":""}', '{"idToken":1}', '{"refreshToken":"x"}', 'not json']) {
        const r = parseWithdrawRequest(request({ bodyText }), APP)
        assert.equal(r.ok, false, bodyText)
        assert.equal(r.status, 400, bodyText)
      }
    })
    it('負: 大きすぎる本文 → 413・設定の不備 → 500', () => {
      const big = parseWithdrawRequest(request({ bodyText: JSON.stringify({ idToken: 'x'.repeat(9000) }) }), APP)
      assert.equal(big.ok, false)
      assert.equal(big.status, 413)
      const bad = parseWithdrawRequest(request(), 'not a url')
      assert.equal(bad.ok, false)
      assert.equal(bad.status, 500)
    })
  })
})

describe('LR-A7 完了の再実行', () => {
  const run = (overrides) =>
    runCompleteOnboarding({
      findProfile: spy(['absent']),
      callRpc: spy([OK]),
      wait: noWait,
      ...overrides,
    })

  it('正: profiles が既にある → RPC を呼ばず成功', async () => {
    const callRpc = spy([OK])
    const outcome = await run({ findProfile: spy(['exists']), callRpc })
    assert.deepEqual(outcome, { status: 'completed', rpcCalls: 0 })
    assert.equal(callRpc.calls, 0)
  })
  it('正: profiles が無く RPC が成功 → 成功(RPC は 1 回)', async () => {
    const callRpc = spy([OK])
    assert.deepEqual(await run({ callRpc }), { status: 'completed', rpcCalls: 1 })
    assert.equal(callRpc.calls, 1)
  })
  it('正: 同意前の行が無いことによる拒否で、profiles が既にある → 成功', async () => {
    const outcome = await run({ findProfile: spy(['absent', 'exists']), callRpc: spy([NO_PENDING]) })
    assert.deepEqual(outcome, { status: 'completed', rpcCalls: 1 })
  })
  it('正: 一時の失敗(実は 1 回目が成功していた) → 同じ要求の中の再実行で拒否 → profiles を見て成功', async () => {
    const callRpc = spy([NETWORK, NO_PENDING])
    const outcome = await run({ findProfile: spy(['absent', 'absent', 'exists']), callRpc })
    assert.deepEqual(outcome, { status: 'completed', rpcCalls: 2 })
  })
  it('正: 一時の失敗 → 同じ要求の中で再実行して成功', async () => {
    const waits = []
    const callRpc = spy([SERVER_ERROR, NETWORK, OK])
    const outcome = await run({ callRpc, wait: async (ms) => waits.push(ms) })
    assert.deepEqual(outcome, { status: 'completed', rpcCalls: 3 })
    assert.equal(waits.length, 2)
  })
  it('負: 一時の失敗が続いても上限(3 回 = 再実行 2 回)で止まり、失敗を返す', async () => {
    const callRpc = spy([NETWORK])
    const outcome = await run({ callRpc })
    assert.deepEqual(outcome, { status: 'failed', kind: 'transient', rpcCalls: 3 })
    assert.equal(callRpc.calls, COMPLETE_ONBOARDING_MAX_ATTEMPTS)
  })
  it('負: そのほかの 23505(profiles が無いまま)・同意前の行が無い(profiles も無い)・削除中の印 → 再実行せず失敗', async () => {
    for (const [result, kind] of [
      [UNIQUE, 'other'],
      [NO_PENDING, 'no_pending'],
      [BEING_REMOVED, 'being_removed'],
      [NOT_AUTH, 'not_authenticated'],
      [raised('invalid username'), 'other'],
    ]) {
      const callRpc = spy([result])
      const outcome = await run({ callRpc })
      assert.deepEqual(outcome, { status: 'failed', kind, rpcCalls: 1 }, kind)
      assert.equal(callRpc.calls, 1)
    }
  })
  it('profiles の問い合わせが失敗(unknown)でも RPC へ進み、「行がある」とは扱わない', async () => {
    const callRpc = spy([UNIQUE])
    const outcome = await run({ findProfile: spy(['unknown']), callRpc })
    assert.deepEqual(outcome, { status: 'failed', kind: 'other', rpcCalls: 1 })
  })
  it('RPC が例外を投げても通信の失敗として再実行する', async () => {
    const callRpc = spy([new Error('boom'), OK])
    assert.deepEqual(await run({ callRpc }), { status: 'completed', rpcCalls: 2 })
  })
})

describe('Onboarding の中止(印 → Firebase → 行)', () => {
  const run = (overrides = {}) => {
    const d = {
      userId: 'lr-b-b9-1',
      findProfile: spy(['absent']),
      beginWithdrawal: spy([OK]),
      firebaseDelete: spy([true]),
      finishWithdrawal: spy([OK]),
      log: logs(),
      ...overrides,
    }
    return { d, promise: runAbortOnboarding(d) }
  }

  it('正: profiles が無い → begin_withdrawal → Firebase の削除 → finish_withdrawal の順で 1 回ずつ → done', async () => {
    const order = []
    const { promise } = run({
      beginWithdrawal: async () => {
        order.push('begin')
        return OK
      },
      firebaseDelete: async () => {
        order.push('firebase')
        return true
      },
      finishWithdrawal: async () => {
        order.push('finish')
        return OK
      },
    })
    assert.deepEqual(await promise, { status: 'done' })
    assert.deepEqual(order, ['begin', 'firebase', 'finish'])
  })
  it('負: profiles に行がある → onboarded で何も呼ばない(DB 0 回・Firebase 0 回)', async () => {
    const { d, promise } = run({ findProfile: spy(['exists']) })
    assert.deepEqual(await promise, { status: 'onboarded' })
    assert.equal(d.beginWithdrawal.calls, 0)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })
  it('負: profiles の問い合わせが失敗 → 何も呼ばず failed(「行が無い」側へ進まない)', async () => {
    const { d, promise } = run({ findProfile: spy(['unknown']) })
    assert.deepEqual(await promise, { status: 'failed', stage: 'profile' })
    assert.equal(d.beginWithdrawal.calls, 0)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })
  it('負: begin_withdrawal の失敗 → 2 回まで再試行し、なお失敗なら failed(Firebase 0 回・finish 0 回)', async () => {
    const { d, promise } = run({ beginWithdrawal: spy([NETWORK, SERVER_ERROR, NOT_AUTH]) })
    assert.deepEqual(await promise, { status: 'failed', stage: 'begin' })
    assert.equal(d.beginWithdrawal.calls, 3)
    assert.equal(d.firebaseDelete.calls, 0)
    assert.equal(d.finishWithdrawal.calls, 0)
  })
  it('正: begin_withdrawal の再試行が成功 → 続けて完了', async () => {
    const { d, promise } = run({ beginWithdrawal: spy([NETWORK, OK]) })
    assert.deepEqual(await promise, { status: 'done' })
    assert.equal(d.beginWithdrawal.calls, 2)
    assert.equal(d.finishWithdrawal.calls, 1)
  })
  it('Firebase の削除が成功以外(例外を含む) → finish_withdrawal を 0 回で done(毎時の削除が片付ける・uid だけをログ)', async () => {
    for (const result of [false, new Error('timeout')]) {
      const log = logs()
      const { d, promise } = run({ firebaseDelete: spy([result]), log })
      assert.deepEqual(await promise, { status: 'done' })
      assert.equal(d.finishWithdrawal.calls, 0)
      assert.deepEqual(log.events, ['abort.firebase_delete_failed:lr-b-b9-1'])
    }
  })
  it('finish_withdrawal が上限の後も失敗 → 3 回で止まり done(uid だけをログに残す)', async () => {
    const log = logs()
    const { d, promise } = run({ finishWithdrawal: spy([NETWORK]), log })
    assert.deepEqual(await promise, { status: 'done' })
    assert.equal(d.finishWithdrawal.calls, WITHDRAWAL_DB_MAX_ATTEMPTS)
    assert.deepEqual(log.events, ['abort.finish_failed:lr-b-b9-1'])
  })
})
