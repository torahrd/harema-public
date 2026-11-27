// T-W5: リストの絞りと「選ぶ」の純粋な関数。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filterByList, pinIconFor } from '../../../../../../packages/shared/lists/index.ts'
import {
  bulkActionsEnabled,
  bulkBarRows,
  countsForTabs,
  emptyListNoteVisible,
  listChoiceForNewPlace,
  listsForBulkAdd,
  listsOfPlace,
  resolveSelectedList,
  selectEntryEnabled,
  selectionAfterSave,
  selectionLimitHit,
  statusChoices,
  toggleSelection,
  withPlaceCounts,
} from '../list-selection.ts'

const lists = [
  { id: 'a', name: 'ラーメン', icon: '🍜', created_at: '2026-01-01T00:00:00+00:00' },
  { id: 'b', name: 'カフェ', icon: '☕', created_at: '2026-02-01T00:00:00+00:00' },
]

describe('T-W5 絞りの解決', () => {
  it('resolveSelectedList は lists に無い id を「すべて」(null)にする', () => {
    assert.equal(resolveSelectedList(null, lists), null)
    assert.equal(resolveSelectedList('a', lists), 'a')
    assert.equal(resolveSelectedList('gone', lists), null)
    assert.equal(resolveSelectedList('a', []), null)
  })
  it('selectionAfterSave は、保存した店が今の絞りに入っていなければ null・入っていればそのまま', () => {
    assert.equal(selectionAfterSave('a', ['b']), null)
    assert.equal(selectionAfterSave('a', []), null)
    assert.equal(selectionAfterSave('a', ['a', 'b']), 'a')
    assert.equal(selectionAfterSave(null, ['b']), null)
  })
})

describe('T-W5 「選ぶ」', () => {
  it('行を押すと足され、もう一度押すと外れる', () => {
    assert.deepEqual(toggleSelection([], 'x'), ['x'])
    assert.deepEqual(toggleSelection(['x'], 'y'), ['x', 'y'])
    assert.deepEqual(toggleSelection(['x', 'y'], 'x'), ['y'])
  })
  it('100 件に達したら足さない(外すのはできる)', () => {
    const full = Array.from({ length: 100 }, (_, i) => `id${i}`)
    assert.equal(toggleSelection(full, 'new').length, 100)
    assert.ok(!toggleSelection(full, 'new').includes('new'))
    assert.equal(toggleSelection(full, 'id0').length, 99)
  })
  it('元の配列を書き換えない', () => {
    const a = ['x']
    toggleSelection(a, 'y')
    assert.deepEqual(a, ['x'])
  })
  it('0 件では帯のボタンが押せない', () => {
    assert.equal(bulkActionsEnabled(0), false)
    assert.equal(bulkActionsEnabled(1), true)
  })
})

describe('T-W5 絞った時にピンと行へ渡るのは filterByList を通った行だけ・名前の並びは作った順', () => {
  const rows = [
    { id: 'p1', listIds: ['a', 'b'] },
    { id: 'p2', listIds: ['b'] },
    { id: 'p3', listIds: [] },
  ]
  it('絞ると、そのリストに入っている店だけが残り、アイコンはそのリストの物', () => {
    const shown = filterByList(rows, 'a')
    assert.deepEqual(shown.map((r) => r.id), ['p1'])
    assert.equal(pinIconFor(shown[0].listIds, lists, 'a'), '🍜')
  })
  it('行の右の名前の並びは作った順(渡す順によらない)', () => {
    assert.deepEqual(listsOfPlace(['b', 'a'], [lists[1], lists[0]]).map((l) => l.id), ['a', 'b'])
    assert.deepEqual(listsOfPlace([], lists), [])
  })
})

describe('T1 帯のボタンは見ている所で変わる', () => {
  it('すべてでは「外す」を出さない(上段は入れるだけ・下段は状態と削除)', () => {
    assert.deepEqual(bulkBarRows(null), [['add'], ['status', 'delete']])
    assert.ok(!bulkBarRows(null).flat().includes('remove'))
  })
  it('リストで絞っている時は、上段が入れると外す・下段は状態と削除', () => {
    assert.deepEqual(bulkBarRows('a'), [['add', 'remove'], ['status', 'delete']])
  })
  it('入れる段のリストは今のリストを除く・すべてなら全部', () => {
    assert.deepEqual(listsForBulkAdd(lists, 'a').map((l) => l.id), ['b'])
    assert.deepEqual(listsForBulkAdd(lists, null).map((l) => l.id), ['a', 'b'])
    assert.deepEqual(listsForBulkAdd(lists, 'gone').map((l) => l.id), ['a', 'b'])
  })
})

describe('T1 状態を選ぶ段の 3 行', () => {
  const enabled = (current) =>
    Object.fromEntries(statusChoices(current).choices.map((c) => [c.status, c.enabled]))
  it('行きたいのタブ: 行きたいだけ押せない・注記なし', () => {
    assert.deepEqual(enabled('want_to_go'), { want_to_go: false, visit_again: true, no_thanks: true })
    assert.equal(statusChoices('want_to_go').showRevertNote, false)
  })
  it('また行きたいのタブ: 行きたいと「また行きたい」が押せない・注記あり', () => {
    assert.deepEqual(enabled('visit_again'), { want_to_go: false, visit_again: false, no_thanks: true })
    assert.equal(statusChoices('visit_again').showRevertNote, true)
  })
  it('もういいのタブ: 行きたいと「もういい」が押せない・注記あり', () => {
    assert.deepEqual(enabled('no_thanks'), { want_to_go: false, visit_again: true, no_thanks: false })
    assert.equal(statusChoices('no_thanks').showRevertNote, true)
  })
  it('どの場合も、今の状態は 1 行だけ・3 行が並ぶ', () => {
    for (const current of ['want_to_go', 'visit_again', 'no_thanks']) {
      const { choices } = statusChoices(current)
      assert.equal(choices.length, 3)
      assert.deepEqual(choices.filter((c) => c.current).map((c) => c.status), [current])
    }
  })
})

describe('lists-filter-carry T1 タブの件数・「選ぶ」・保存の初期の選び', () => {
  const rows = [
    { status: 'want_to_go', listIds: ['a'] },
    { status: 'want_to_go', listIds: ['a', 'b'] },
    { status: 'want_to_go', listIds: ['b'] },
    { status: 'want_to_go', listIds: [] },
    { status: 'visit_again', listIds: ['a'] },
    { status: 'visit_again', listIds: [] },
    { status: 'no_thanks', listIds: [] },
  ]
  const server = { want_to_go: 4, visit_again: 2, no_thanks: 1 }
  it('lists-filter-carry countsForTabs は、すべての時はサーバの数・絞った時は絞った後の数', () => {
    assert.deepEqual(countsForTabs(server, rows, null), server)
    assert.deepEqual(countsForTabs(server, rows, 'a'), { want_to_go: 2, visit_again: 1, no_thanks: 0 })
    assert.deepEqual(countsForTabs(server, rows, 'b'), { want_to_go: 2, visit_again: 0, no_thanks: 0 })
    assert.deepEqual(countsForTabs(server, rows, 'empty'), { want_to_go: 0, visit_again: 0, no_thanks: 0 })
  })
  it('lists-filter-carry selectEntryEnabled は、見えている行が 0 件で選んでいない時だけ偽', () => {
    assert.equal(selectEntryEnabled(0, false), false)
    assert.equal(selectEntryEnabled(0, true), true)
    assert.equal(selectEntryEnabled(1, false), true)
    assert.equal(selectEntryEnabled(3, true), true)
  })
  it('lists-filter-carry listChoiceForNewPlace は、絞りがあればそのリスト 1 つ・無ければ空', () => {
    assert.deepEqual(listChoiceForNewPlace('a'), ['a'])
    assert.deepEqual(listChoiceForNewPlace(null), [])
    assert.deepEqual(listChoiceForNewPlace(undefined), [])
  })
  it('lists-filter-carry emptyListNoteVisible は、絞っていて店が 0 件で、まだ閉じていない時だけ真', () => {
    assert.equal(emptyListNoteVisible('a', 0, null), true)
    assert.equal(emptyListNoteVisible(null, 0, null), false)
    // 「すべて」へ戻した後(閉じたリストの印が残っていても)は出さない。
    assert.equal(emptyListNoteVisible(null, 0, 'a'), false)
    assert.equal(emptyListNoteVisible('a', 2, null), false)
    assert.equal(emptyListNoteVisible('a', 0, 'a'), false)
    assert.equal(emptyListNoteVisible('b', 0, 'a'), true)
  })
  it('lists-filter-carry selectionLimitHit は、選びが上限に達していて、まだ選んでいない行を押した時だけ真', () => {
    const full = Array.from({ length: 100 }, (_, i) => `id${i}`)
    assert.equal(selectionLimitHit(full, 'extra'), true)
    assert.equal(selectionLimitHit(full, 'id5'), false)
    assert.equal(selectionLimitHit(full.slice(0, 99), 'extra'), false)
    assert.equal(selectionLimitHit([], 'x'), false)
    assert.equal(selectionLimitHit(['a', 'b'], 'c', 2), true)
    assert.equal(selectionLimitHit(['a', 'b'], 'a', 2), false)
  })
})

describe('lists-screen T1 withPlaceCounts(「リスト」の画面の店の数)', () => {
  const three = [...lists, { id: 'c', name: 'デート', icon: null, created_at: '2026-03-01T00:00:00+00:00' }]
  it('所属から、リストごとの店の数を数える(入っていないリストは 0)', () => {
    const membership = new Map([
      ['s1', ['a', 'b']],
      ['s2', ['a']],
      ['s3', ['a']],
      ['s4', ['b']],
    ])
    assert.deepEqual(
      withPlaceCounts(three, membership).map((l) => [l.name, l.placeCount]),
      [
        ['ラーメン', 3],
        ['カフェ', 2],
        ['デート', 0],
      ],
    )
  })
  it('所属が空なら全部 0', () => {
    assert.deepEqual(
      withPlaceCounts(three, new Map()).map((l) => l.placeCount),
      [0, 0, 0],
    )
  })
  it('並び・id・name・icon・created_at は入力のまま(数を足すだけ)・入力は変えない', () => {
    const before = JSON.stringify(three)
    const out = withPlaceCounts(three, new Map([['s1', ['a']]]))
    assert.deepEqual(
      out.map(({ placeCount: _count, ...rest }) => rest),
      three,
    )
    assert.equal(JSON.stringify(three), before)
  })
  it('自分のリストに無い id の所属は数に入れない', () => {
    const out = withPlaceCounts(three, new Map([['s1', ['gone', 'a']]]))
    assert.deepEqual(
      out.map((l) => l.placeCount),
      [1, 0, 0],
    )
  })
})
