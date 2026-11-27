// T3: 保存した店の一括の状態の変更・一括の削除の核(bulk-core.ts)。順序(Zod → getUser → openDb → DB)と userId の出どころを見る。
// 実行: `pnpm --filter web test`(node の type stripping で直接読む。DB・ネットワークは使わない)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runBulkChangeStatus, runBulkDeleteSavedPlaces } from '../bulk-core.ts'

const A = 'd0000000-0000-4000-8000-000000000001'
const B = 'd0000000-0000-4000-8000-000000000002'

/** 依存の呼び出しを全部記録する。`over` で個別に差し替える。 */
function makeEnv({ user = { id: 'user-from-token' }, over = {} } = {}) {
  const calls = { getUser: 0, openDb: 0, db: [] }
  const rec = (name, result) => async (arg) => {
    calls.db.push([name, arg])
    return result
  }
  const deps = {
    updateStatus: rec('updateStatus', over.updateStatus ?? { ok: true }),
    deleteSavedPlaces: rec('deleteSavedPlaces', over.deleteSavedPlaces ?? { ok: true }),
  }
  const env = {
    getUser: async () => {
      calls.getUser += 1
      return user
    },
    openDb: async () => {
      calls.openDb += 1
      return deps
    },
  }
  return { env, calls }
}

const runners = {
  status: [runBulkChangeStatus, { savedPlaceIds: [A, B], from: 'want_to_go', to: 'visit_again' }],
  delete: [runBulkDeleteSavedPlaces, { savedPlaceIds: [A, B] }],
}
const label = { status: '状態', delete: '削除' }

for (const [name, [run, valid]] of Object.entries(runners)) {
  describe(`T3 ${label[name]}の核`, () => {
    it(`未ログインは openDb と DB を呼ばない(${label[name]})`, async () => {
      const { env, calls } = makeEnv({ user: null })
      assert.deepEqual(await run(valid, env), { ok: false, reason: 'unauthenticated' })
      assert.equal(calls.getUser, 1)
      assert.equal(calls.openDb, 0)
      assert.equal(calls.db.length, 0)
    })
    it('Zod を通らない入力は getUser も openDb も DB も呼ばず invalid_input', async () => {
      for (const bad of [{}, { savedPlaceIds: [] }, { savedPlaceIds: ['x'], from: 'want_to_go', to: 'visit_again' }, null]) {
        const { env, calls } = makeEnv()
        assert.deepEqual(await run(bad, env), { ok: false, reason: 'invalid_input' })
        assert.equal(calls.getUser, 0)
        assert.equal(calls.openDb, 0)
        assert.equal(calls.db.length, 0)
      }
    })
    it(`userId は getUser の値(${label[name]})。入力に userId を混ぜても変わらない`, async () => {
      const { env, calls } = makeEnv()
      await run({ ...valid, userId: 'u2', user_id: 'u2' }, env)
      assert.equal(calls.db.length, 1)
      assert.equal(calls.db[0][1].userId, 'user-from-token')
      assert.deepEqual(calls.db[0][1].savedPlaceIds, [A, B])
    })
    it('DB の失敗は failed', async () => {
      const key = name === 'status' ? 'updateStatus' : 'deleteSavedPlaces'
      const { env } = makeEnv({ over: { [key]: { ok: false } } })
      assert.deepEqual(await run(valid, env), { ok: false, reason: 'failed' })
    })
    it('成功は { ok: true } だけ(ほかの鍵を返さない)', async () => {
      const { env } = makeEnv()
      const result = await run(valid, env)
      assert.deepEqual(result, { ok: true })
      assert.deepEqual(Object.keys(result), ['ok'])
    })
  })
}

describe('T3 状態の遷移', () => {
  it('評価済みから行きたいへ・同じ状態への変更は invalid_input で DB を呼ばない', async () => {
    const cases = [
      ['visit_again', 'want_to_go'],
      ['no_thanks', 'want_to_go'],
      ['want_to_go', 'want_to_go'],
      ['visit_again', 'visit_again'],
    ]
    for (const [from, to] of cases) {
      const { env, calls } = makeEnv()
      assert.deepEqual(await runBulkChangeStatus({ savedPlaceIds: [A], from, to }, env), {
        ok: false,
        reason: 'invalid_input',
      })
      assert.equal(calls.getUser, 0)
      assert.equal(calls.db.length, 0)
    }
  })
  it('表が許す遷移は from と to をそのまま DB の依存へ渡す', async () => {
    const { env, calls } = makeEnv()
    await runBulkChangeStatus({ savedPlaceIds: [A], from: 'no_thanks', to: 'visit_again' }, env)
    assert.deepEqual(calls.db, [
      ['updateStatus', { userId: 'user-from-token', savedPlaceIds: [A], from: 'no_thanks', to: 'visit_again' }],
    ])
  })
})
