// T-C1・T-C4・T-C5: リストの契約(名前・入力のスキーマ・絞り・ピンのアイコンの決め方)。
// 実行: `pnpm --filter web test`(node の type stripping で直接読む。DB・ネットワークは使わない)
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  LIST_BULK_MAX,
  LIST_ICON_MAX_LENGTH,
  LIST_MAX_PER_USER,
  LIST_NAME_MAX_LENGTH,
} from '../../../../../packages/shared/constants/limits.ts'
import {
  createListInputSchema,
  deleteListInputSchema,
  listIconLengthSchema,
  listIdSchema,
  listNameSchema,
  listPlacesChangeSchema,
  placeListsInputSchema,
  updateListInputSchema,
} from '../../../../../packages/shared/validations/list.ts'
import { listIconSchema, readListIcon } from '../../../../../packages/shared/validations/list-icon.ts'
import { ja } from '../../../../../packages/shared/i18n/ja.ts'
import { en } from '../../../../../packages/shared/i18n/en.ts'
import { filterByList, pinIconFor } from '../../../../../packages/shared/lists/index.ts'

const UUID = 'c0000000-0000-4000-8000-000000000001'

describe('リストの名前とアイコンの長さの定数', () => {
  it('DB の CHECK と同じ値(名前の 15 は所有者の決定 2026-11-26 00:56 JST・harema#152。変えるときは新しい migration と一緒に)', () => {
    assert.equal(LIST_NAME_MAX_LENGTH, 15)
    assert.equal(LIST_ICON_MAX_LENGTH, 32)
  })
  it('リストの数の上限は DB のトリガー(private.enforce_list_limit)と同じ値(所有者の決定 2026-11-26 00:04 JST・harema#152。変えるときは新しい migration と一緒に)', () => {
    assert.equal(LIST_MAX_PER_USER, 3)
  })
  it('migration の最後の名前の CHECK(lists_name_check)が、定数と同じ上限で、1 文で替え、NOT VALID でない', () => {
    // pgTAP(13_lists.sql)は Docker の要る local の Supabase でしか走らないので、定数と migration の数字のずれをここでも見る。
    // 対象 = 本文(`--` で始まる行を除く)に `char_length(name) between 1 and <数>` を持つ、名前順で最後の migration。
    const dir = new URL('../../../../../packages/supabase/supabase/migrations/', import.meta.url)
    const checkPattern = /char_length\(name\)\s+between\s+1\s+and\s+(\d+)/i
    const bodyOf = (f) =>
      readFileSync(new URL(f, dir), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => checkPattern.test(bodyOf(f)))
    assert.ok(defining.length >= 1, '名前の CHECK(char_length(name) between 1 and …)を持つ migration が無い')
    const body = bodyOf(defining[defining.length - 1])
    const match = checkPattern.exec(body)
    assert.equal(Number(match?.[1]), LIST_NAME_MAX_LENGTH, '名前の CHECK の上限が定数と違う')
    assert.ok(/drop\s+constraint\s+lists_name_check/i.test(body), 'drop constraint lists_name_check が無い')
    assert.ok(/add\s+constraint\s+lists_name_check/i.test(body), 'add constraint lists_name_check が無い')
    assert.ok(!/not\s+valid/i.test(body), 'not valid が有る')
  })
  it('migration の最後の private.enforce_list_limit の定義が、定数と同じ上限・detail を持ち、INVOKER で search_path が空', () => {
    // pgTAP(13_lists.sql)は Docker の要る local の Supabase でしか走らないので、定数と migration の数字のずれをここでも見る。
    // 対象 = create (or replace) function private.enforce_list_limit() を持つ、名前順で最後の migration。読むのは、その定義から次の `$f$;` まで。
    const dir = new URL('../../../../../packages/supabase/supabase/migrations/', import.meta.url)
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => /create\s+(or\s+replace\s+)?function\s+private\.enforce_list_limit\(\)/i.test(readFileSync(new URL(f, dir), 'utf8')))
    assert.ok(defining.length >= 1, 'private.enforce_list_limit を定義する migration が無い')
    const text = readFileSync(new URL(defining[defining.length - 1], dir), 'utf8')
    const start = text.search(/create\s+(or\s+replace\s+)?function\s+private\.enforce_list_limit\(\)/i)
    const end = text.indexOf('$f$;', start)
    assert.ok(end > start, '定義の終わり($f$;)が無い')
    const body = text.slice(start, end + 4)
    assert.ok(body.includes(`>= ${LIST_MAX_PER_USER} then`), `>= ${LIST_MAX_PER_USER} then が無い`)
    assert.ok(body.includes(`max=${LIST_MAX_PER_USER}`), `max=${LIST_MAX_PER_USER} が無い`)
    assert.ok(body.includes("set search_path = ''"), "set search_path = '' が無い")
    assert.ok(!/security\s+definer/i.test(body), 'security definer が有る')
  })
})

describe('T-C1 リストの名前', () => {
  it('空と空白だけを拒む(全角の空白も)', () => {
    assert.equal(listNameSchema.safeParse('').success, false)
    assert.equal(listNameSchema.safeParse('   ').success, false)
    assert.equal(listNameSchema.safeParse('\u3000\u3000').success, false)
  })
  it('16 字を拒み、15 字を通す', () => {
    assert.equal(listNameSchema.safeParse('あ'.repeat(16)).success, false)
    assert.equal(listNameSchema.safeParse('あ'.repeat(15)).success, true)
  })
  it('絵文字は 1 コードポイントずつ数える(15 個を通し、16 個を拒む)', () => {
    assert.equal(listNameSchema.safeParse('🍜'.repeat(15)).success, true)
    assert.equal(listNameSchema.safeParse('🍜'.repeat(16)).success, false)
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
    assert.equal(listNameSchema.safeParse(' ' + 'あ'.repeat(15) + ' ').success, true)
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
  it('作る入力のアイコンは省略・null・一覧の絵文字だけ(長さだけの検査は DB の鏡像として別に残る)', () => {
    assert.equal(createListInputSchema.safeParse({ name: 'x' }).success, true)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: null }).success, true)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: '' }).success, false)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: 'a'.repeat(33) }).success, false)
    assert.equal(listIconLengthSchema.safeParse('a'.repeat(32)).success, true)
    assert.equal(listIconLengthSchema.safeParse('a'.repeat(33)).success, false)
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

const SAVED_UUID = 'd0000000-0000-4000-8000-000000000002'
const uuids = (n) => Array.from({ length: n }, (_, i) => `d0000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

describe('T-C2 一括・店ごとの入れ替え・削除の入力', () => {
  it('一括の上限は 100(仮の上限)', () => {
    assert.equal(LIST_BULK_MAX, 100)
  })
  it('一括は 1〜100 個の uuid だけ。0 個・101 個・uuid でない物を拒む', () => {
    const base = { listId: UUID, op: 'add' }
    assert.equal(listPlacesChangeSchema.safeParse({ ...base, savedPlaceIds: [] }).success, false)
    assert.equal(listPlacesChangeSchema.safeParse({ ...base, savedPlaceIds: uuids(1) }).success, true)
    assert.equal(listPlacesChangeSchema.safeParse({ ...base, savedPlaceIds: uuids(100) }).success, true)
    assert.equal(listPlacesChangeSchema.safeParse({ ...base, savedPlaceIds: uuids(101) }).success, false)
    assert.equal(listPlacesChangeSchema.safeParse({ ...base, savedPlaceIds: ['x'] }).success, false)
    assert.equal(listPlacesChangeSchema.safeParse({ listId: 'x', op: 'add', savedPlaceIds: uuids(1) }).success, false)
  })
  it('op は add と remove だけ', () => {
    assert.equal(listPlacesChangeSchema.safeParse({ listId: UUID, savedPlaceIds: uuids(1), op: 'add' }).success, true)
    assert.equal(listPlacesChangeSchema.safeParse({ listId: UUID, savedPlaceIds: uuids(1), op: 'remove' }).success, true)
    assert.equal(listPlacesChangeSchema.safeParse({ listId: UUID, savedPlaceIds: uuids(1), op: 'replace' }).success, false)
  })
  it('入力に userId があっても出力に残らない', () => {
    const out = listPlacesChangeSchema.parse({ listId: UUID, savedPlaceIds: [SAVED_UUID], op: 'add', userId: 'u2', user_id: 'u2' })
    assert.deepEqual(out, { listId: UUID, savedPlaceIds: [SAVED_UUID], op: 'add' })
    assert.deepEqual(deleteListInputSchema.parse({ listId: UUID, userId: 'u2' }), { listId: UUID })
  })
  it('店ごとの入れ替えは 0 個を通し、4 個(上限の次)・重複・uuid でない物を拒む', () => {
    assert.equal(placeListsInputSchema.safeParse({ googlePlaceId: 'ChIJabc', listIds: [] }).success, true)
    assert.equal(placeListsInputSchema.safeParse({ googlePlaceId: 'ChIJabc', listIds: uuids(3) }).success, true)
    assert.equal(placeListsInputSchema.safeParse({ googlePlaceId: 'ChIJabc', listIds: uuids(4) }).success, false)
    assert.equal(placeListsInputSchema.safeParse({ googlePlaceId: 'ChIJabc', listIds: [UUID, UUID] }).success, false)
    assert.equal(placeListsInputSchema.safeParse({ googlePlaceId: 'ChIJabc', listIds: ['x'] }).success, false)
    assert.equal(placeListsInputSchema.safeParse({ googlePlaceId: '', listIds: [] }).success, false)
    const out = placeListsInputSchema.parse({ googlePlaceId: 'ChIJabc', listIds: [UUID], userId: 'u2' })
    assert.deepEqual(out, { googlePlaceId: 'ChIJabc', listIds: [UUID] })
  })
})

describe('T-C3 リストのアイコン', () => {
  const OK = [
    '🍜', '👨\u200d👩\u200d👧', '🇯🇵', '👍🏽', '☕', '✈\ufe0f', '🦄',
    '麺', '珈', 'A', 'す', '1', '#', 'か\u3099', '葛\u{e0100}',
    '★', '♪', 'ｶ', 'ｶﾞ', '✈',
  ]
  const NG = [
    '', 'ab', '麺麺', ' ', '\u3000', '\u200b', '\u202e', 'a\u202e', 'a\u0301\u0302\u0303\u0304', '\u0301',
    '🍜🍜', ' 🍜', '🍜 ', '\ue000', 'a'.repeat(33), '👨\u200d'.repeat(20) + '👨',
    '\u3164', '\u2800', '\u115f', '\u1160', '\uffa0', '\ufffc', '\u{1d159}',
    'a\u{1f3fd}', '\u{1f35c}\u{1f3fd}',
    'a\u{e0061}', '\u{1f468}\u200d\u{1f35c}', 'a\u0301\u0302\u0303', '\r\n',
  ]
  it('1 文字(絵文字・漢字・かな・英数・結合形・異体字セレクタつき)と null を通す', () => {
    assert.equal(listIconSchema.safeParse(null).success, true)
    for (const icon of OK) assert.equal(listIconSchema.safeParse(icon).success, true, JSON.stringify(icon))
  })
  it('空・2 文字以上・空白・見えない文字・結合記号の重ね・私用領域・長すぎるものを拒む', () => {
    for (const icon of NG) assert.equal(listIconSchema.safeParse(icon).success, false, JSON.stringify(icon))
  })
  it('readListIcon は 1 文字をそのまま返し、外れた値・空・null を null にする', () => {
    for (const icon of OK) assert.equal(readListIcon(icon), icon)
    for (const icon of NG) assert.equal(readListIcon(icon), null, JSON.stringify(icon))
    assert.equal(readListIcon(null), null)
    assert.equal(readListIcon(undefined), null)
  })
  it('createListInputSchema・updateListInputSchema が 1 文字でない icon を拒む', () => {
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: 'ab' }).success, false)
    assert.equal(createListInputSchema.safeParse({ name: 'x', icon: '🍜' }).success, true)
    assert.equal(updateListInputSchema.safeParse({ listId: UUID, icon: '🍜🍜' }).success, false)
    assert.equal(updateListInputSchema.safeParse({ listId: UUID, icon: null }).success, true)
  })
  it('直した行を pinIconFor に渡すと、一覧に無い値のリストは飛ばされ、次に古いアイコンありのリストが選ばれる', () => {
    const raw = [
      { id: 'x', icon: 'ab', created_at: '2026-01-01T00:00:00+00:00' },
      { id: 'y', icon: '🍣', created_at: '2026-02-01T00:00:00+00:00' },
    ]
    const fixed = raw.map((l) => ({ ...l, icon: readListIcon(l.icon) }))
    assert.equal(pinIconFor(['x', 'y'], fixed, null), '🍣')
  })
})

describe('T-I1 web.lists の文言は仮の決定(DESIGN.md の 5 の表)のとおり', () => {
  const JA = {
    filterAll: 'すべて',
    filterLabel: 'リストで絞る',
    empty: '当てはまる店はありません。',
    select: '選ぶ',
    selectedCount: '{count} 件を選択中',
    bulkLimit: '一度に選べるのは {count} 件までです。',
    bulkAdd: 'リストに入れる',
    bulkRemove: 'リストから外す',
    pickAddTitle: '入れるリストを選ぶ',
    bulkStatus: '状態を変える',
    statusPickTitle: '状態を選ぶ',
    statusCurrent: '今の状態',
    bulkDeleteConfirmTitle: '削除しますか？',
    bulkDeleteConfirmBody: '選んだ {count} 件の店を、保存した店から削除します。メモ・状態・出典も消え、元に戻せません。',
    toastAdded: 'リストに入れました。',
    toastRemoved: 'リストから外しました。',
    toastErrorBody: 'リストを変更できませんでした。',
    toastErrorTail: '少し待って、もう一度お試しください。',
    label: 'リスト',
    nameSeparator: '、',
    pickTitle: 'リストを選ぶ',
    pickConfirm: '決定する',
    newList: '新しいリスト',
    editTitle: 'リストを編集',
    nameLabel: '名前',
    namePlaceholder: '例: ラーメン',
    nameHelp: '1〜15字。前後の空白は除かれます。',
    iconLabel: 'アイコン',
    iconHelp: '1字。絵文字・漢字・かな・英字・数字が使えます。',
    iconError: '1字だけ入れてください。',
    create: '作成する',
    deleteConfirmTitle: 'リストを削除しますか？',
    deleteConfirmBody: '「{name}」を削除します。元に戻せません。入れていた店は消えず、保存した店に残ります。',
    limit: 'リストは 3 個までです。',
  }
  it('鍵は 32 個 + 読み上げの 2 個(bulkLimit は単位 lists-filter-carry の受入条件 6。edit・editLabel は単位 lists-screen で、使っていない pickRemoveTitle は文言の照らし(harema#152)で外した)で、ja の値は表のとおり 1 字ずつ同じ', () => {
    assert.equal(Object.keys(JA).length, 34)
    assert.deepEqual(ja.web.lists, JA)
  })
  it('en は同じ鍵を持つ', () => {
    assert.deepEqual(Object.keys(en.web.lists).sort(), Object.keys(JA).sort())
  })
})
