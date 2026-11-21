// T-C1・T-C4・T-C5: リストの契約(名前・入力のスキーマ・絞り・ピンのアイコンの決め方)。
// 実行: `pnpm --filter web test`(node の type stripping で直接読む。DB・ネットワークは使わない)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LIST_ICON_MAX_LENGTH,
  LIST_MAX_PER_USER,
  LIST_NAME_MAX_LENGTH,
} from '../../../../../packages/shared/constants/limits.ts'
import {
  createListInputSchema,
  listIdSchema,
  listNameSchema,
  updateListInputSchema,
} from '../../../../../packages/shared/validations/list.ts'
import { filterByList, pinIconFor } from '../../../../../packages/shared/lists/index.ts'

const UUID = 'c0000000-0000-4000-8000-000000000001'

describe('リストの名前とアイコンの長さの定数', () => {
  it('DB の CHECK と同じ値', () => {
    assert.equal(LIST_NAME_MAX_LENGTH, 30)
    assert.equal(LIST_ICON_MAX_LENGTH, 32)
  })
  it('リストの数の上限は DB のトリガー(private.enforce_list_limit)と同じ値(仮の上限。変えるときは新しい migration と一緒に)', () => {
    assert.equal(LIST_MAX_PER_USER, 100)
  })
})

describe('T-C1 リストの名前', () => {
  it('空と空白だけを拒む(全角の空白も)', () => {
    assert.equal(listNameSchema.safeParse('').success, false)
    assert.equal(listNameSchema.safeParse('   ').success, false)
    assert.equal(listNameSchema.safeParse('\u3000\u3000').success, false)
  })
  it('31 字を拒み、30 字を通す', () => {
    assert.equal(listNameSchema.safeParse('あ'.repeat(31)).success, false)
    assert.equal(listNameSchema.safeParse('あ'.repeat(30)).success, true)
  })
  it('絵文字は 1 コードポイントずつ数える(30 個を通し、31 個を拒む)', () => {
    assert.equal(listNameSchema.safeParse('🍜'.repeat(30)).success, true)
    assert.equal(listNameSchema.safeParse('🍜'.repeat(31)).success, false)
  })
  it('不可視の文字・制御文字・改行を拒む', () => {
    for (const bad of ['a\u200bb', 'a\u202eb', 'a\u0000b', 'a\nb', 'a\tb', 'a\ufeffb']) {
      assert.equal(listNameSchema.safeParse(bad).success, false, JSON.stringify(bad))
    }
  })
  it('絵文字の合成(ZWJ・異体字セレクタ)は通す', () => {
    assert.equal(listNameSchema.safeParse('👨\u200d🍳').success, true)
    assert.equal(listNameSchema.safeParse('🌶\ufe0f').success, true)
  })
  it('前後の空白を trim する', () => {
    assert.equal(listNameSchema.parse('  ラーメン  '), 'ラーメン')
    assert.equal(listNameSchema.safeParse(' ' + 'あ'.repeat(30) + ' ').success, true)
  })
  it('文字列でない物を拒む', () => {
    assert.equal(listNameSchema.safeParse(null).success, false)
    assert.equal(listNameSchema.safeParse(1).success, false)
  })
})

describe('T-C1 リストの入力', () => {
  it('uuid でない id を拒む', () => {
    assert.equal(listIdSchema.safeParse('abc').success, false)
    assert.equal(listIdSchema.safeParse(UUID).success, true)
  })
  it('作る入力は利用者の ID を受けず、出力に残さない', () => {
    const out = createListInputSchema.parse({ name: ' 渋谷 ', icon: '🍜', userId: 'u2', user_id: 'u2' })
    assert.deepEqual(out, { name: '渋谷', icon: '🍜' })
  })
  it('作る入力のアイコンは省略・null・長さの範囲だけ', () => {
    assert.equal(createListInputSchema.safeParse({ name: 'x' }).success, true)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: null }).success, true)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: '' }).success, false)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: 'a'.repeat(33) }).success, false)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: 'a'.repeat(32) }).success, true)
  })
  it('変える入力は変える項目を 1 つ以上要り、利用者の ID を残さない', () => {
    assert.equal(updateListInputSchema.safeParse({ listId: UUID }).success, false)
    assert.equal(updateListInputSchema.safeParse({ listId: 'x', name: 'a' }).success, false)
    const out = updateListInputSchema.parse({ listId: UUID, icon: null, userId: 'u2' })
    assert.deepEqual(out, { listId: UUID, icon: null })
    assert.deepEqual(updateListInputSchema.parse({ listId: UUID, name: ' a ' }), { listId: UUID, name: 'a' })
  })
})

const rows = [
  { id: 'p1', listIds: ['a', 'b'] },
  { id: 'p2', listIds: ['b'] },
  { id: 'p3', listIds: [] },
]

describe('T-C4 filterByList', () => {
  it('「すべて」(null)は全件を、元の並びで返す', () => {
    assert.deepEqual(filterByList(rows, null).map((r) => r.id), ['p1', 'p2', 'p3'])
  })
  it('リストを選ぶと、そのリストに入っている店だけ', () => {
    assert.deepEqual(filterByList(rows, 'b').map((r) => r.id), ['p1', 'p2'])
    assert.deepEqual(filterByList(rows, 'a').map((r) => r.id), ['p1'])
    assert.deepEqual(filterByList(rows, 'zzz'), [])
  })
  it('元の配列を書き換えない', () => {
    const copy = JSON.stringify(rows)
    filterByList(rows, 'a')
    filterByList(rows, null)
    assert.equal(JSON.stringify(rows), copy)
  })
})

describe('T-C5 pinIconFor', () => {
  const lists = [
    { id: 'c', icon: '🍣', created_at: '2026-03-01T00:00:00+00:00' },
    { id: 'a', icon: '🍜', created_at: '2026-01-01T00:00:00+00:00' },
    { id: 'b', icon: null, created_at: '2026-02-01T00:00:00+00:00' },
    { id: 'd', icon: '🍺', created_at: '2026-01-01T00:00:00+00:00' },
  ]
  it('絞っている時はそのリストのアイコン', () => {
    assert.equal(pinIconFor(['a', 'c'], lists, 'c'), '🍣')
  })
  it('絞っているリストがアイコンなしなら null', () => {
    assert.equal(pinIconFor(['a', 'b'], lists, 'b'), null)
  })
  it('絞っていない時は、入っているリストのうち一番古いアイコンありのリスト', () => {
    assert.equal(pinIconFor(['c', 'a'], lists, null), '🍜')
    assert.equal(pinIconFor(['c'], lists, null), '🍣')
  })
  it('一番古いリストがアイコンなしなら、次に古いアイコンありのリスト(icon が null のリストは飛ばす)', () => {
    const l = [
      { id: 'x', icon: null, created_at: '2026-01-01T00:00:00+00:00' },
      { id: 'y', icon: '🍣', created_at: '2026-02-01T00:00:00+00:00' },
    ]
    assert.equal(pinIconFor(['x', 'y'], l, null), '🍣')
  })
  it('同じ時刻なら id の小さい方', () => {
    assert.equal(pinIconFor(['d', 'a'], lists, null), '🍜')
  })
  it('どれにも入っていない・どれもアイコンなしなら null', () => {
    assert.equal(pinIconFor([], lists, null), null)
    assert.equal(pinIconFor(['b'], lists, null), null)
    assert.equal(pinIconFor(['unknown'], lists, null), null)
  })
  it('受け取った icon をそのまま選ぶ(一覧の判定はここでしない)', () => {
    assert.equal(pinIconFor(['a'], [{ id: 'a', icon: 'anything', created_at: '2026-01-01T00:00:00+00:00' }], null), 'anything')
  })
  it('時刻は文字列でなく時刻として比べる(書き方が違っても古い方が先)', () => {
    const l = [
      { id: 'p', icon: '🅰', created_at: '2026-01-01T09:00:00+09:00' },
      { id: 'q', icon: '🅱', created_at: '2026-01-01T01:00:00+00:00' },
    ]
    assert.equal(pinIconFor(['p', 'q'], l, null), '🅰')
  })
})
