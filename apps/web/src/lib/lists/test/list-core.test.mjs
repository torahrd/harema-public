// T-W1〜T-W4・T-W10: リストの書き込みの核(list-core.ts)。順序(Zod → getUser → listsOpen → openDb → DB)と userId の出どころを見る。
// T-A6: 門(listsOpen)が閉じている間は、5 つの run* が openDb を呼ばず failed を返す。getUser の後に見る。
// 実行: `pnpm --filter web test`(node の type stripping で直接読む。DB・ネットワークは使わない)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  runChangeListPlaces,
  runCreateList,
  runDeleteList,
  runSetPlaceLists,
  runUpdateList,
} from '../list-core.ts'

const L1 = 'c0000000-0000-4000-8000-000000000001'
const L2 = 'c0000000-0000-4000-8000-000000000002'
const L3 = 'c0000000-0000-4000-8000-000000000003'
const SP = 'd0000000-0000-4000-8000-000000000001'
const ROW = { id: L1, name: 'ラーメン', icon: '🍜', created_at: '2026-01-01T00:00:00+00:00' }

/** 依存の呼び出しを全部記録する。`over` で個別に差し替える。 */
function makeEnv({ user = { id: 'user-from-token' }, over = {}, listsOpen = true } = {}) {
  const calls = { getUser: 0, listsOpen: 0, openDb: 0, db: [] }
  const rec = (name, result) => async (arg) => {
    calls.db.push([name, arg])
    return typeof result === 'function' ? result(arg) : result
  }
  const deps = {
    insertList: rec('insertList', { ok: true, row: ROW }),
    updateList: rec('updateList', { ok: true, found: true }),
    deleteList: rec('deleteList', { ok: true }),
    readOwnListIds: rec('readOwnListIds', { ok: true, ids: [L1, L2, L3] }),
    findSavedPlace: rec('findSavedPlace', { ok: true, row: { id: SP, listIds: [L1, L2] } }),
    addListPlaces: rec('addListPlaces', { ok: true }),
    removeListPlaces: rec('removeListPlaces', { ok: true }),
    ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, rec(k, v)])),
  }
  const env = {
    getUser: async () => {
      calls.getUser += 1
      return user
    },
    listsOpen: async () => {
      calls.listsOpen += 1
      return listsOpen
    },
    openDb: async () => {
      calls.openDb += 1
      return deps
    },
  }
  return { env, calls }
}

const valid = {
  create: { name: 'ラーメン', icon: '🍜' },
  update: { listId: L1, name: 'カフェ' },
  delete: { listId: L1 },
  change: { listId: L1, savedPlaceIds: [SP], op: 'add' },
  set: { googlePlaceId: 'ChIJabc', listIds: [L1] },
}
const runners = {
  create: runCreateList,
  update: runUpdateList,
  delete: runDeleteList,
  change: runChangeListPlaces,
  set: runSetPlaceLists,
}
const invalid = {
  create: { name: '' },
  update: { listId: 'x', name: 'a' },
  delete: { listId: 'x' },
  change: { listId: L1, savedPlaceIds: [], op: 'add' },
  set: { googlePlaceId: 'ChIJabc', listIds: ['x'] },
}

describe('T-W1 未ログインは何も呼ばずに unauthenticated', () => {
  for (const name of Object.keys(runners)) {
    it(name, async () => {
      const { env, calls } = makeEnv({ user: null })
      const result = await runners[name](valid[name], env)
      assert.deepEqual(result, { ok: false, reason: 'unauthenticated' })
      assert.equal(calls.getUser, 1)
      assert.equal(calls.listsOpen, 0, '未ログインでは門も見ない')
      assert.equal(calls.openDb, 0)
      assert.equal(calls.db.length, 0)
    })
  }
})

describe('T-W2 Zod を通らない入力は getUser も DB も呼ばずに invalid_input', () => {
  for (const name of Object.keys(runners)) {
    it(name, async () => {
      const { env, calls } = makeEnv()
      const result = await runners[name](invalid[name], env)
      assert.deepEqual(result, { ok: false, reason: 'invalid_input' })
      assert.equal(calls.getUser, 0)
      assert.equal(calls.openDb, 0)
      assert.equal(calls.db.length, 0)
    })
  }
})

describe('T-W3 DB の依存に渡る userId は getUser の返した id だけ', () => {
  const forged = { userId: 'u2', user_id: 'u2' }
  it('(a) insertList', async () => {
    const { env, calls } = makeEnv()
    await runCreateList({ ...valid.create, ...forged }, env)
    assert.deepEqual(calls.db, [['insertList', { userId: 'user-from-token', name: 'ラーメン', icon: '🍜' }]])
  })
  it('(b) updateList', async () => {
    const { env, calls } = makeEnv()
    await runUpdateList({ ...valid.update, ...forged }, env)
    assert.deepEqual(calls.db, [['updateList', { userId: 'user-from-token', listId: L1, patch: { name: 'カフェ' } }]])
  })
  it('(c) deleteList', async () => {
    const { env, calls } = makeEnv()
    await runDeleteList({ ...valid.delete, ...forged }, env)
    assert.deepEqual(calls.db, [['deleteList', { userId: 'user-from-token', listId: L1 }]])
  })
  it('(d) readOwnListIds・findSavedPlace', async () => {
    const { env, calls } = makeEnv()
    await runSetPlaceLists({ ...valid.set, ...forged }, env)
    const named = calls.db.filter(([n]) => n === 'readOwnListIds' || n === 'findSavedPlace')
    assert.equal(named.length, 2)
    for (const [, arg] of named) assert.equal(arg.userId, 'user-from-token')
  })
  it('一括は userId を受けず、入力の userId も使わない', async () => {
    const { env, calls } = makeEnv()
    await runChangeListPlaces({ ...valid.change, ...forged }, env)
    assert.deepEqual(calls.db, [['addListPlaces', [{ listId: L1, savedPlaceId: SP }]]])
  })
})

describe('T-W4 失敗の写し方', () => {
  it('insert が SQLSTATE 54000 を返すと limit', async () => {
    const { env } = makeEnv({ over: { insertList: { ok: false, code: '54000' } } })
    assert.deepEqual(await runCreateList(valid.create, env), { ok: false, reason: 'limit' })
  })
  it('ほかの失敗は failed', async () => {
    for (const code of ['23514', '42501', null]) {
      const { env } = makeEnv({ over: { insertList: { ok: false, code } } })
      assert.deepEqual(await runCreateList(valid.create, env), { ok: false, reason: 'failed' })
    }
  })
  it('作れたら作った行を返す', async () => {
    const { env } = makeEnv()
    assert.deepEqual(await runCreateList(valid.create, env), { ok: true, list: ROW })
  })
  it('update の 0 行は not_found・DB の失敗は failed', async () => {
    const a = makeEnv({ over: { updateList: { ok: true, found: false } } })
    assert.deepEqual(await runUpdateList(valid.update, a.env), { ok: false, reason: 'not_found' })
    const b = makeEnv({ over: { updateList: { ok: false } } })
    assert.deepEqual(await runUpdateList(valid.update, b.env), { ok: false, reason: 'failed' })
  })
  it('delete は 0 行でも ok(既に無い)・DB の失敗は failed', async () => {
    const a = makeEnv()
    assert.deepEqual(await runDeleteList(valid.delete, a.env), { ok: true })
    const b = makeEnv({ over: { deleteList: { ok: false } } })
    assert.deepEqual(await runDeleteList(valid.delete, b.env), { ok: false, reason: 'failed' })
  })
  it('一括: add は addListPlaces・remove は removeListPlaces。落ちたら failed', async () => {
    const a = makeEnv()
    await runChangeListPlaces({ ...valid.change, op: 'remove' }, a.env)
    assert.deepEqual(a.calls.db, [['removeListPlaces', { listId: L1, savedPlaceIds: [SP] }]])
    const b = makeEnv({ over: { addListPlaces: { ok: false } } })
    assert.deepEqual(await runChangeListPlaces(valid.change, b.env), { ok: false, reason: 'failed' })
  })
})

const names = (calls) => calls.db.map(([n]) => n)

describe('T-W10 setPlaceLists の核', () => {
  it('(a) 保存の行が無い → not_found で、upsert・delete を呼ばない', async () => {
    const { env, calls } = makeEnv({ over: { findSavedPlace: { ok: true, row: null } } })
    assert.deepEqual(await runSetPlaceLists(valid.set, env), { ok: false, reason: 'not_found' })
    assert.ok(!names(calls).includes('addListPlaces'))
    assert.ok(!names(calls).includes('removeListPlaces'))
  })
  it('(b) 今 {A,B}・送る {B,C} → upsert は [C] だけ・delete は [A] だけ・upsert が先', async () => {
    const { env, calls } = makeEnv()
    const result = await runSetPlaceLists({ googlePlaceId: 'ChIJabc', listIds: [L2, L3] }, env)
    assert.deepEqual(result, { ok: true })
    const writes = calls.db.filter(([n]) => n === 'addListPlaces' || n === 'removeListPlaces')
    assert.deepEqual(writes, [
      ['addListPlaces', [{ listId: L3, savedPlaceId: SP }]],
      ['removeListPlaces', { listId: L1, savedPlaceIds: [SP] }],
    ])
  })
  it('(c) 今と同じ → どちらも呼ばない', async () => {
    const { env, calls } = makeEnv()
    assert.deepEqual(await runSetPlaceLists({ googlePlaceId: 'ChIJabc', listIds: [L2, L1] }, env), { ok: true })
    assert.ok(!names(calls).includes('addListPlaces'))
    assert.ok(!names(calls).includes('removeListPlaces'))
  })
  it('(d) 送った id に自分の lists に無い物が在る → not_found で書かない', async () => {
    const { env, calls } = makeEnv({ over: { readOwnListIds: { ok: true, ids: [L1, L2] } } })
    const result = await runSetPlaceLists({ googlePlaceId: 'ChIJabc', listIds: [L1, L3] }, env)
    assert.deepEqual(result, { ok: false, reason: 'not_found' })
    assert.ok(!names(calls).includes('addListPlaces'))
    assert.ok(!names(calls).includes('removeListPlaces'))
  })
  it('(e) upsert が落ちたら delete を呼ばずに failed', async () => {
    const { env, calls } = makeEnv({ over: { addListPlaces: { ok: false } } })
    const result = await runSetPlaceLists({ googlePlaceId: 'ChIJabc', listIds: [L2, L3] }, env)
    assert.deepEqual(result, { ok: false, reason: 'failed' })
    assert.ok(!names(calls).includes('removeListPlaces'))
  })
  it('(f) 保存の行を引く依存に渡る userId は検証済みの id', async () => {
    const { env, calls } = makeEnv()
    await runSetPlaceLists({ ...valid.set, userId: 'u2' }, env)
    const find = calls.db.find(([n]) => n === 'findSavedPlace')
    assert.deepEqual(find[1], { userId: 'user-from-token', googlePlaceId: 'ChIJabc' })
  })
  it('空の listIds は、今入っている全部を外す', async () => {
    const { env, calls } = makeEnv()
    await runSetPlaceLists({ googlePlaceId: 'ChIJabc', listIds: [] }, env)
    const removed = calls.db.filter(([n]) => n === 'removeListPlaces').map(([, a]) => a.listId)
    assert.deepEqual(removed.sort(), [L1, L2].sort())
  })
})

describe('T-A6 門が閉じている間は DB に触れず failed(getUser の後・openDb の前に見る)', () => {
  const label = {
    create: '作る',
    update: '変える',
    delete: '消す',
    change: '一括',
    set: '保存のシートの入れ替え',
  }
  for (const name of Object.keys(runners)) {
    it(`門が閉じている間は openDb を呼ばない(${label[name]})`, async () => {
      const { env, calls } = makeEnv({ listsOpen: false })
      const result = await runners[name](valid[name], env)
      assert.deepEqual(result, { ok: false, reason: 'failed' })
      assert.equal(calls.getUser, 1)
      assert.equal(calls.listsOpen, 1)
      assert.equal(calls.openDb, 0)
      assert.equal(calls.db.length, 0)
    })
    it(`門が開いていれば今までどおり DB へ進む(${label[name]})`, async () => {
      const { env, calls } = makeEnv({ listsOpen: true })
      const result = await runners[name](valid[name], env)
      assert.equal(result.ok, true)
      assert.equal(calls.listsOpen, 1)
      assert.equal(calls.openDb, 1)
    })
    it(`入力が不正なら門も見ない(${label[name]})`, async () => {
      const { env, calls } = makeEnv({ listsOpen: false })
      const result = await runners[name](invalid[name], env)
      assert.deepEqual(result, { ok: false, reason: 'invalid_input' })
      assert.equal(calls.listsOpen, 0)
    })
  }
})
