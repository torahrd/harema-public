import { LIST_BULK_MAX, SAVED_PLACE_STATUSES, type SavedPlaceStatus } from '@harema/shared/constants'
import { filterByList } from '@harema/shared/lists'
import { isAllowedStatusChange } from '@harema/shared/validations'

// リストの絞りと「選ぶ」の状態を決める純粋な関数(react・DB は import しない。node のテストが直接読む)。
// 出どころ: 単位 lists-web の PLAN 2.4。

/** 絞りの元になるリストの列。 */
type ListLike = { id: string }
export type ListChoice = { id: string; name: string; icon: string | null; created_at: string }

/**
 * 持っている絞りの id を、今あるリストに照らして返す。リストが消えていれば null(= 「すべて」)。
 * 画面は、持っている id を `filterByList`・`pinIconFor`・札の選びに渡す前に必ずこれを通す。
 */
export function resolveSelectedList(
  selectedListId: string | null,
  lists: readonly ListLike[],
): string | null {
  if (selectedListId === null) return null
  return lists.some((list) => list.id === selectedListId) ? selectedListId : null
}

/**
 * 地図で保存・更新が通った後の絞り。その店が今の絞りのリストに入っていなければ「すべて」(null)に戻す。
 * 入っていれば、絞りはそのまま。
 */
export function selectionAfterSave(
  selectedListId: string | null,
  savedListIds: readonly string[],
): string | null {
  if (selectedListId === null) return null
  return savedListIds.includes(selectedListId) ? selectedListId : null
}

/**
 * 一覧の「選ぶ」で、行を押した時の選び。入っていれば外し、入っていなければ足す。
 * 選びが `max` に達していたら足さない(外すのはできる)。
 */
export function toggleSelection(
  selectedIds: readonly string[],
  id: string,
  max: number = LIST_BULK_MAX,
): string[] {
  if (selectedIds.includes(id)) return selectedIds.filter((x) => x !== id)
  if (selectedIds.length >= max) return [...selectedIds]
  return [...selectedIds, id]
}

/**
 * 「選ぶ」で、行を押したのに上限で足せなかったか(まだ選んでいない行で、選びが `max` に達している)。
 * 選んである行を押して外すのは上限に関わらず足せなかったことにならない。真の時、画面は上限の知らせを出す。
 */
export function selectionLimitHit(
  selectedIds: readonly string[],
  id: string,
  max: number = LIST_BULK_MAX,
): boolean {
  return !selectedIds.includes(id) && selectedIds.length >= max
}

/** 帯のボタンを押せるのは、1 件以上を選んでいる間だけ。 */
export function bulkActionsEnabled(selectedCount: number): boolean {
  return selectedCount > 0
}

/** 帯のボタンの種類。 */
export type BulkBarButton = 'add' | 'remove' | 'status' | 'delete'

/**
 * 帯の段(上から)とボタン(左から)。見ている所で出す操作が変わる。
 * 「すべて」(null)は上段が「リストに入れる」だけ(外す先が無い)。あるリストで絞っている時は「リストに入れる」「リストから外す」。
 * 下段はどちらも「状態を変える」「削除する」。単位 lists-bulk の PLAN 1.4・W5。
 */
export function bulkBarRows(activeListId: string | null): BulkBarButton[][] {
  const top: BulkBarButton[] = activeListId === null ? ['add'] : ['add', 'remove']
  return [top, ['status', 'delete']]
}

/** 「リストに入れる」の段に出すリスト。今見ているリストは除く(そこへ入れる意味が無い)。「すべて」(null)なら全部。 */
export function listsForBulkAdd<T extends { id: string }>(
  lists: readonly T[],
  activeListId: string | null,
): T[] {
  return lists.filter((list) => list.id !== activeListId)
}

export type StatusChoice = {
  status: SavedPlaceStatus
  /** 今のタブの状態(「今の状態」を右に出す行)。 */
  current: boolean
  /** 押せる行。今の状態と、評価済みからの「行きたい」(1 件ずつの編集と同じ決まり)は押せない。 */
  enabled: boolean
}

/**
 * 状態を選ぶ段の 3 行と、注記(「評価済みから「行きたい」へは戻せません。」)を出すか。
 * 注記は評価済みのタブ(`current !== 'want_to_go'`)だけ。遷移の表は shared の `isAllowedStatusChange`。
 */
export function statusChoices(current: SavedPlaceStatus): {
  choices: StatusChoice[]
  showRevertNote: boolean
} {
  return {
    choices: SAVED_PLACE_STATUSES.map((status) => ({
      status,
      current: status === current,
      enabled: status !== current && isAllowedStatusChange(current, status),
    })),
    showRevertNote: current !== 'want_to_go',
  }
}

function createdAtMs(value: string): number {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? 0 : ms
}

/** 店が入っているリストを、作った順(`created_at` の昇順・同じ時刻は `id` の昇順)に並べる。 */
export function listsOfPlace<T extends { id: string; created_at: string }>(
  listIds: readonly string[],
  lists: readonly T[],
): T[] {
  const member = new Set(listIds)
  return lists
    .filter((list) => member.has(list.id))
    .sort((a, b) => {
      const diff = createdAtMs(a.created_at) - createdAtMs(b.created_at)
      if (diff !== 0) return diff
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

/** 店の数つきのリスト(「リスト」の画面の行)。 */
export type ListWithCount = ListChoice & { placeCount: number }

/**
 * 「リスト」の画面の行に出す店の数。所属(保存した店の id → 入っているリストの id の並び)を 1 回走査して数える。
 * 所属の行は同じ店が同じリストに 2 回入らない(主キー `(list_id, saved_place_id)`)ので、数 = そのリストに入っている保存した店の数
 * (状態を問わない)。自分のリストに無い id の所属は数に入れない。リストの並びと値は変えない。単位 lists-screen の PLAN 1.2。
 */
export function withPlaceCounts(
  lists: readonly ListChoice[],
  membership: ReadonlyMap<string, readonly string[]>,
): ListWithCount[] {
  const tally = new Map<string, number>()
  for (const listIds of membership.values()) {
    for (const listId of listIds) tally.set(listId, (tally.get(listId) ?? 0) + 1)
  }
  return lists.map((list) => ({ ...list, placeCount: tally.get(list.id) ?? 0 }))
}

/** タブの札の数(状態ごと)。 */
export type TabCounts = Record<SavedPlaceStatus, number>

/**
 * 一覧のタブの札の数。「すべて」(null)ならサーバの数をそのまま返す。
 * 絞っている時は、行・ピンと同じ絞り(`filterByList`)を通した行を状態ごとに数える。単位 lists-filter-carry の PLAN 1 の 6。
 */
export function countsForTabs(
  serverCounts: TabCounts,
  rows: readonly { status: SavedPlaceStatus; listIds: readonly string[] }[],
  activeListId: string | null,
): TabCounts {
  if (activeListId === null) return serverCounts
  const counts: TabCounts = { want_to_go: 0, visit_again: 0, no_thanks: 0 }
  for (const row of filterByList(rows, activeListId)) counts[row.status] += 1
  return counts
}

/** 一覧の右上の「選ぶ」を押せるのは、選んでいる間(「キャンセル」)か、見えている行が 1 件以上ある時だけ。 */
export function selectEntryEnabled(visibleCount: number, selecting: boolean): boolean {
  return selecting || visibleCount > 0
}

/** 保存のシートで、新しい店を保存する時の「リスト」の初期の選び。絞っているリストがあればその 1 つ、無ければ空。 */
export function listChoiceForNewPlace(defaultListId: string | null | undefined): string[] {
  return typeof defaultListId === 'string' ? [defaultListId] : []
}

/**
 * 地図で、絞っているリストに地図に出す店が 0 件の時の知らせ(「当てはまる店はありません。」)を出すか。
 * 絞っていなければ出さない。× で閉じたリスト(`dismissedFor`)では、絞りを替えるまで出さない。
 * 検索・地図の読み込み・同意の門などの画面の状態は、呼び出し側が見る。単位 lists-filter-carry の受入条件 5。
 */
export function emptyListNoteVisible(
  activeListId: string | null,
  pinCount: number,
  dismissedFor: string | null,
): boolean {
  return activeListId !== null && pinCount === 0 && dismissedFor !== activeListId
}
