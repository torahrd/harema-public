// T2: 保存した店の一括の状態の変更・一括の削除の入力のスキーマ。実行: `pnpm --filter web test`
// (node の type stripping で直接読む。DB・ネットワークは使わない)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bulkDeleteSavedPlacesSchema,
  bulkStatusChangeSchema,
} from '../../../../../packages/shared/validations/saved-place-bulk.ts'

const ID = 'd0000000-0000-4000-8000-000000000001'
const ids = (n) =>
  Array.from({ length: n }, (_, i) => `d0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
const STATUSES = ['want_to_go', 'visit_again', 'no_thanks']
// 通る遷移は 4 つだけ(評価済みから「行きたい」へ戻す 3 つと、同じ状態への 3 つは拒む)。
const ALLOWED = new Set([
  'want_to_go>visit_again',
  'want_to_go>no_thanks',
  'visit_again>no_thanks',
  'no_thanks>visit_again',
])

describe('T2 一括の状態の変更', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const ok = ALLOWED.has(`${from}>${to}`)
      it(`${from} → ${to} は${ok ? '通す' : '拒む'}`, () => {
        assert.equal(bulkStatusChangeSchema.safeParse({ savedPlaceIds: [ID], from, to }).success, ok)
      })
    }
  }
  it('評価済みから行きたいへは拒む', () => {
    for (const from of ['visit_again', 'no_thanks']) {
      assert.equal(
        bulkStatusChangeSchema.safeParse({ savedPlaceIds: [ID], from, to: 'want_to_go' }).success,
        false,
      )
    }
  })
  it('0 件と 101 件を拒み、1 件と 100 件を通す', () => {
    const base = { from: 'want_to_go', to: 'visit_again' }
    assert.equal(bulkStatusChangeSchema.safeParse({ ...base, savedPlaceIds: [] }).success, false)
    assert.equal(bulkStatusChangeSchema.safeParse({ ...base, savedPlaceIds: ids(101) }).success, false)
    assert.equal(bulkStatusChangeSchema.safeParse({ ...base, savedPlaceIds: ids(1) }).success, true)
    assert.equal(bulkStatusChangeSchema.safeParse({ ...base, savedPlaceIds: ids(100) }).success, true)
  })
  it('uuid でない id・状態でない値を拒む', () => {
    const base = { from: 'want_to_go', to: 'visit_again' }
    assert.equal(bulkStatusChangeSchema.safeParse({ ...base, savedPlaceIds: ['x'] }).success, false)
    assert.equal(
      bulkStatusChangeSchema.safeParse({ savedPlaceIds: [ID], from: 'want_to_go', to: 'done' }).success,
      false,
    )
    assert.equal(
      bulkStatusChangeSchema.safeParse({ savedPlaceIds: [ID], from: 'nope', to: 'visit_again' }).success,
      false,
    )
    assert.equal(bulkStatusChangeSchema.safeParse({ savedPlaceIds: [ID], to: 'visit_again' }).success, false)
  })
  it('余分な鍵(userId)は出力に残らない', () => {
    const parsed = bulkStatusChangeSchema.safeParse({
      savedPlaceIds: [ID],
      from: 'want_to_go',
      to: 'visit_again',
      userId: 'someone-else',
    })
    assert.equal(parsed.success, true)
    assert.deepEqual(Object.keys(parsed.data).sort(), ['from', 'savedPlaceIds', 'to'])
  })
})

describe('T2 一括の削除', () => {
  it('0 件と 101 件を拒み、1 件と 100 件を通す', () => {
    assert.equal(bulkDeleteSavedPlacesSchema.safeParse({ savedPlaceIds: [] }).success, false)
    assert.equal(bulkDeleteSavedPlacesSchema.safeParse({ savedPlaceIds: ids(101) }).success, false)
    assert.equal(bulkDeleteSavedPlacesSchema.safeParse({ savedPlaceIds: ids(1) }).success, true)
    assert.equal(bulkDeleteSavedPlacesSchema.safeParse({ savedPlaceIds: ids(100) }).success, true)
  })
  it('uuid でない id を拒む・savedPlaceIds が無ければ拒む', () => {
    assert.equal(bulkDeleteSavedPlacesSchema.safeParse({ savedPlaceIds: ['x'] }).success, false)
    assert.equal(bulkDeleteSavedPlacesSchema.safeParse({}).success, false)
  })
  it('余分な鍵(userId)は出力に残らない', () => {
    const parsed = bulkDeleteSavedPlacesSchema.safeParse({ savedPlaceIds: [ID], userId: 'someone-else' })
    assert.equal(parsed.success, true)
    assert.deepEqual(Object.keys(parsed.data), ['savedPlaceIds'])
  })
})
