// T-W4・T-W7: 店の保存の核(runSavePlace)・出典のタイトルの核(runFetchSourceTitle)・遷移の表(isAllowedStatusChange)。
// 実行: `pnpm --filter web test`(node の type stripping で直接読む。DB・ネットワークは使わない)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAllowedStatusChange } from '../../../../../../packages/shared/validations/status-transition.ts'
import { runFetchSourceTitle, runSavePlace } from '../save-core.ts'

const PLACE = { googlePlaceId: 'ChIJtest', latitude: 35.1, longitude: 139.2 }
const parsed = (overrides = {}) => ({
  googlePlaceId: 'ChIJtest',
  status: 'want_to_go',
  memo: null,
  sourceText: null,
  sourceTitle: null,
  ...overrides,
})

function makeDeps(overrides = {}) {
  const calls = { fetch: 0, upsert: 0, find: 0, insert: [], update: [] }
  const deps = {
    userId: 'user-from-token',
    fetchPlaceLocation: async () => {
      calls.fetch += 1
      return PLACE
    },
    upsertVerifiedPlace: async () => {
      calls.upsert += 1
      return 'place-uuid'
    },
    findSavedStatus: async () => {
      calls.find += 1
      return { ok: true, status: null }
    },
    insertSaved: async (placeId, fields) => {
      calls.insert.push({ placeId, fields })
      return { ok: true }
    },
    updateSaved: async (placeId, fields) => {
      calls.update.push({ placeId, fields })
      return true
    },
    isAllowedStatusChange,
    ...overrides,
  }
  return { calls, deps }
}

describe('runSavePlace', () => {
  it('(a) Place Details が null → place_not_found・upsert 0 回・insert 0 回', async () => {
    const { calls, deps } = makeDeps({ fetchPlaceLocation: async () => null })
    assert.deepEqual(await runSavePlace(parsed(), deps), { ok: false, reason: 'place_not_found' })
    assert.equal(calls.upsert, 0)
    assert.equal(calls.insert.length, 0)
    assert.equal(calls.find, 0)
  })

  it('(b) upsert が投げる → failed・insert 0 回', async () => {
    const { calls, deps } = makeDeps({
      upsertVerifiedPlace: async () => {
        throw new Error('db down')
      },
    })
    assert.deepEqual(await runSavePlace(parsed(), deps), { ok: false, reason: 'failed' })
    assert.equal(calls.insert.length, 0)
  })

  it('(c) 既存なし → insert 1 回・created(行の中身は入力どおり)', async () => {
    const { calls, deps } = makeDeps()
    const result = await runSavePlace(
      parsed({ status: 'visit_again', memo: 'm', sourceText: 's', sourceTitle: 't' }),
      deps,
    )
    assert.deepEqual(result, { ok: true, mode: 'created' })
    assert.deepEqual(calls.insert, [
      {
        placeId: 'place-uuid',
        fields: { status: 'visit_again', memo: 'm', source_text: 's', source_title: 't' },
      },
    ])
    assert.equal(calls.update.length, 0)
  })

  it('(d) insert が 23505 → conflict / ほかの失敗 → failed', async () => {
    const conflict = makeDeps({ insertSaved: async () => ({ ok: false, conflict: true }) })
    assert.deepEqual(await runSavePlace(parsed(), conflict.deps), { ok: false, reason: 'conflict' })
    const failed = makeDeps({ insertSaved: async () => ({ ok: false, conflict: false }) })
    assert.deepEqual(await runSavePlace(parsed(), failed.deps), { ok: false, reason: 'failed' })
  })

  it('(e) 既存 visit_again → want_to_go → status_reverted・update 0 回(no_thanks も同じ)', async () => {
    for (const existing of ['visit_again', 'no_thanks']) {
      const { calls, deps } = makeDeps({ findSavedStatus: async () => ({ ok: true, status: existing }) })
      assert.deepEqual(await runSavePlace(parsed({ status: 'want_to_go' }), deps), {
        ok: false,
        reason: 'status_reverted',
      })
      assert.equal(calls.update.length, 0, existing)
      assert.equal(calls.insert.length, 0, existing)
    }
  })

  it('(f) 既存 want_to_go → visit_again → update 1 回・updated', async () => {
    const { calls, deps } = makeDeps({ findSavedStatus: async () => ({ ok: true, status: 'want_to_go' }) })
    assert.deepEqual(await runSavePlace(parsed({ status: 'visit_again', memo: 'x' }), deps), {
      ok: true,
      mode: 'updated',
    })
    assert.equal(calls.update.length, 1)
    assert.equal(calls.update[0].placeId, 'place-uuid')
    assert.equal(calls.update[0].fields.memo, 'x')
    assert.equal(calls.insert.length, 0)
  })

  it('(f2) 既存の読み取りが失敗 → failed・insert も update も 0 回 / update が失敗 → failed', async () => {
    const readFail = makeDeps({ findSavedStatus: async () => ({ ok: false }) })
    assert.deepEqual(await runSavePlace(parsed(), readFail.deps), { ok: false, reason: 'failed' })
    assert.equal(readFail.calls.insert.length + readFail.calls.update.length, 0)
    const updateFail = makeDeps({
      findSavedStatus: async () => ({ ok: true, status: 'visit_again' }),
      updateSaved: async () => false,
    })
    assert.deepEqual(await runSavePlace(parsed({ status: 'no_thanks' }), updateFail.deps), {
      ok: false,
      reason: 'failed',
    })
  })

  it('(g) Place Details は 1 回だけ(新規でも更新でも)', async () => {
    const created = makeDeps()
    await runSavePlace(parsed(), created.deps)
    assert.equal(created.calls.fetch, 1)
    const updated = makeDeps({ findSavedStatus: async () => ({ ok: true, status: 'want_to_go' }) })
    await runSavePlace(parsed({ status: 'visit_again' }), updated.deps)
    assert.equal(updated.calls.fetch, 1)
  })

  it('(h) 遷移の判定は shared の本物の関数(deps に別の関数を渡すと結果が変わる = 判定は deps 経由)', async () => {
    const real = makeDeps({ findSavedStatus: async () => ({ ok: true, status: 'visit_again' }) })
    assert.equal((await runSavePlace(parsed({ status: 'want_to_go' }), real.deps)).ok, false)
    const permissive = makeDeps({
      findSavedStatus: async () => ({ ok: true, status: 'visit_again' }),
      isAllowedStatusChange: () => true,
    })
    assert.equal((await runSavePlace(parsed({ status: 'want_to_go' }), permissive.deps)).ok, true)
  })
})

describe('isAllowedStatusChange の表', () => {
  const statuses = ['want_to_go', 'visit_again', 'no_thanks']
  it('from = null・want_to_go・visit_again・no_thanks × to = 3 値 の 12 組。不可は 2 組だけ', () => {
    const denied = []
    let count = 0
    for (const from of [null, ...statuses]) {
      for (const to of statuses) {
        count += 1
        if (!isAllowedStatusChange(from, to)) denied.push(`${from} -> ${to}`)
      }
    }
    assert.equal(count, 12)
    assert.deepEqual(denied.sort(), ['no_thanks -> want_to_go', 'visit_again -> want_to_go'])
  })
})

describe('runFetchSourceTitle', () => {
  const deps = (overrides = {}) => {
    const calls = { claim: 0, fetch: 0, complete: [] }
    return {
      calls,
      deps: {
        claim: async () => {
          calls.claim += 1
          return { allowed: true, key: 'k1' }
        },
        fetchTitle: async () => {
          calls.fetch += 1
          return 'タイトル'
        },
        complete: async (key, title) => {
          calls.complete.push({ key, title })
          return true
        },
        ...overrides,
      },
    }
  }

  it('許可 → 取得 → complete 1 回 → タイトル', async () => {
    const d = deps()
    assert.deepEqual(await runFetchSourceTitle('https://example.com/a', d.deps), { ok: true, title: 'タイトル' })
    assert.deepEqual(d.calls.complete, [{ key: 'k1', title: 'タイトル' }])
  })

  it('抑制で止まり取得済みのタイトルがある → そのタイトル・外への取得 0 回', async () => {
    const d = deps({ claim: async () => ({ allowed: false, cachedTitle: '済み' }) })
    assert.deepEqual(await runFetchSourceTitle('https://example.com/a', d.deps), { ok: true, title: '済み' })
    assert.equal(d.calls.fetch, 0)
    assert.equal(d.calls.complete.length, 0)
  })

  it('抑制で止まり取得済みが無い → unavailable・外への取得 0 回', async () => {
    const d = deps({ claim: async () => ({ allowed: false, cachedTitle: '' }) })
    assert.deepEqual(await runFetchSourceTitle('https://example.com/a', d.deps), { ok: false, reason: 'unavailable' })
    assert.equal(d.calls.fetch, 0)
  })

  it('取得の失敗(null)も complete を 1 回呼び、unavailable', async () => {
    const d = deps({ fetchTitle: async () => null })
    assert.deepEqual(await runFetchSourceTitle('https://example.com/a', d.deps), { ok: false, reason: 'unavailable' })
    assert.deepEqual(d.calls.complete, [{ key: 'k1', title: null }])
  })

  it('complete が失敗 → unavailable', async () => {
    const d = deps({ complete: async () => false })
    assert.deepEqual(await runFetchSourceTitle('https://example.com/a', d.deps), { ok: false, reason: 'unavailable' })
  })
})
