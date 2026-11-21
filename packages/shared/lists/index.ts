/**
 * リストの純粋な関数(react・DB の型は import しない)。web と mobile のピンと行が同じ決め方・同じ絞りを使う。
 * 出どころ: 単位 lists の PLAN 2.4。
 */

/** ピンのアイコンを決めるのに要るリストの列。`icon` は DB から読んで検証した後の値(アイコンなしは null)。 */
export type ListIconSource = {
  id: string
  icon: string | null
  created_at: string
}

function createdAtMs(value: string): number {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * 古い順(`created_at` の昇順・同じ時刻は `id` の昇順)。並び替えの画面を作らずに毎回同じ答えにするための順。
 */
function byOldest(a: ListIconSource, b: ListIconSource): number {
  const diff = createdAtMs(a.created_at) - createdAtMs(b.created_at)
  if (diff !== 0) return diff
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * 店のピンに出すリストのアイコン(出さないときは null = 今のピンのまま)。
 * - リストで絞っている時(`selectedListId` が有る)= そのリストのアイコン。
 * - 絞っていない時 = その店が入っているリストのうち、`created_at` が一番古い(同じなら `id` の小さい)リストの
 *   アイコン。そのリストがアイコンなし(null)なら、次に古いアイコンありのリスト。
 * - どのリストにも入っていない・どれもアイコンなし = null。
 * 「アイコンあり」は `icon` が null でないこと。一覧に在るかの判定はここでは行わない(読みの入口が先に直す)。
 */
export function pinIconFor(
  listIds: readonly string[],
  lists: readonly ListIconSource[],
  selectedListId: string | null,
): string | null {
  if (selectedListId !== null) {
    return lists.find((list) => list.id === selectedListId)?.icon ?? null
  }
  const member = new Set(listIds)
  const candidates = lists.filter((list) => member.has(list.id)).sort(byOldest)
  for (const list of candidates) {
    if (list.icon !== null) return list.icon
  }
  return null
}

/**
 * リストで絞る(「すべて」= `selectedListId` が null は全件・リストを選ぶとそのリストに入っている店だけ)。
 * ピンと行が同じ関数を通る。元の並びを保つ。
 */
export function filterByList<T extends { listIds: readonly string[] }>(
  rows: readonly T[],
  selectedListId: string | null,
): T[] {
  if (selectedListId === null) return [...rows]
  return rows.filter((row) => row.listIds.includes(selectedListId))
}
