/**
 * リストの書き込みの核(Server Action `createList` ほか 5 つが同じ手順を通る)。
 *
 * 順序に意味がある: **shared の Zod → `getUser()`(偽なら `unauthenticated` を返し何も書かない)→ `listsOpen()`(偽なら DB に
 * 触れず `failed`)→ `openDb()` → DB**。`listsOpen` は DB の `agreement_state()` の `lists_open`(ポリシー 4 回目の改定に同意した人にだけ真)。
 * DB の門(restrictive policy)が本体で、これは同意していない人の要求を DB の手前で返すだけ(新しい reason と文言は足さない)。
 * `getUser` は署名・iss・aud・期限を検証した ID トークンの `sub` を返す物(`getVerifiedUser`)。
 * DB の依存は **`userId` を呼び出しごとの引数で受ける**(`save-core.ts` と違い、未ログインの枝と `userId` の出どころを
 * ここで単体の検査が見られるようにする。PLAN 2.3)。client から来た ID は行を指すためだけに使い、持ち主の判定には使わない。
 *
 * 値の import は shared の Zod だけ。DB・cookie は依存として受ける。
 */
import {
  createListInputSchema,
  deleteListInputSchema,
  listPlacesChangeSchema,
  placeListsInputSchema,
  updateListInputSchema,
} from '@harema/shared/validations'

export type ListRowData = { id: string; name: string; icon: string | null; created_at: string }

/** `lists` の insert の失敗。`code` は PostgREST の SQLSTATE(上限のトリガーは `54000`)。 */
export type InsertListResult = { ok: true; row: ListRowData } | { ok: false; code: string | null }

export type ListDeps = {
  insertList: (args: { userId: string; name: string; icon: string | null }) => Promise<InsertListResult>
  /** 0 行 = `found: false`。 */
  updateList: (args: {
    userId: string
    listId: string
    patch: { name?: string; icon?: string | null }
  }) => Promise<{ ok: true; found: boolean } | { ok: false }>
  /** 0 行でも `ok`(既に無い)。 */
  deleteList: (args: { userId: string; listId: string }) => Promise<{ ok: boolean }>
  readOwnListIds: (args: { userId: string }) => Promise<{ ok: true; ids: string[] } | { ok: false }>
  /** 保存した店(`saved_places`)の行と、今入っているリスト。行が無ければ `row: null`。 */
  findSavedPlace: (args: {
    userId: string
    googlePlaceId: string
  }) => Promise<{ ok: true; row: { id: string; listIds: string[] } | null } | { ok: false }>
  addListPlaces: (rows: { listId: string; savedPlaceId: string }[]) => Promise<{ ok: boolean }>
  removeListPlaces: (args: { listId: string; savedPlaceIds: string[] }) => Promise<{ ok: boolean }>
}

export type ListCoreEnv = {
  /** 検証済みの利用者。偽・判定不能なら null。 */
  getUser: () => Promise<{ id: string } | null>
  /** リストを開いてよいか(DB の `lists_open`)。失敗・判定不能は false。`getUser` が通った後・`openDb` の前に見る。 */
  listsOpen: () => Promise<boolean>
  /** 要求ごとの DB の依存。`getUser` と `listsOpen` が通った後にだけ呼ぶ。 */
  openDb: () => Promise<ListDeps> | ListDeps
}

type Failure = 'invalid_input' | 'unauthenticated' | 'failed'

export type CreateListResult =
  | { ok: true; list: ListRowData }
  | { ok: false; reason: Failure | 'limit' }
export type UpdateListResult = { ok: true } | { ok: false; reason: Failure | 'not_found' }
export type DeleteListResult = { ok: true } | { ok: false; reason: Failure }
export type ChangeListPlacesResult = { ok: true } | { ok: false; reason: Failure }
export type SetPlaceListsResult = { ok: true } | { ok: false; reason: Failure | 'not_found' }

/** 上限のトリガー(`private.enforce_list_limit`)の SQLSTATE。 */
const LIST_LIMIT_SQLSTATE = '54000'

export async function runCreateList(input: unknown, env: ListCoreEnv): Promise<CreateListResult> {
  const parsed = createListInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  if (!(await env.listsOpen())) return { ok: false, reason: 'failed' }
  const db = await env.openDb()
  // 数えてから作らない。上限は DB のトリガーが持ち、その失敗(54000)を文言に当てる。upsert は使わない。
  const result = await db.insertList({
    userId: user.id,
    name: parsed.data.name,
    icon: parsed.data.icon ?? null,
  })
  if (!result.ok) {
    return { ok: false, reason: result.code === LIST_LIMIT_SQLSTATE ? 'limit' : 'failed' }
  }
  return { ok: true, list: result.row }
}

export async function runUpdateList(input: unknown, env: ListCoreEnv): Promise<UpdateListResult> {
  const parsed = updateListInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  if (!(await env.listsOpen())) return { ok: false, reason: 'failed' }
  const db = await env.openDb()
  const { listId, ...patch } = parsed.data
  const result = await db.updateList({ userId: user.id, listId, patch })
  if (!result.ok) return { ok: false, reason: 'failed' }
  return result.found ? { ok: true } : { ok: false, reason: 'not_found' }
}

export async function runDeleteList(input: unknown, env: ListCoreEnv): Promise<DeleteListResult> {
  const parsed = deleteListInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  if (!(await env.listsOpen())) return { ok: false, reason: 'failed' }
  const db = await env.openDb()
  const result = await db.deleteList({ userId: user.id, listId: parsed.data.listId })
  return result.ok ? { ok: true } : { ok: false, reason: 'failed' }
}

export async function runChangeListPlaces(
  input: unknown,
  env: ListCoreEnv,
): Promise<ChangeListPlacesResult> {
  const parsed = listPlacesChangeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  if (!(await env.listsOpen())) return { ok: false, reason: 'failed' }
  const db = await env.openDb()
  const { listId, savedPlaceIds, op } = parsed.data
  // 持ち主は RLS が見る(list_places は user_id の列を持たない)。入れるのは upsert(ignoreDuplicates)で、既にある行は無視する。
  const result =
    op === 'add'
      ? await db.addListPlaces(savedPlaceIds.map((savedPlaceId) => ({ listId, savedPlaceId })))
      : await db.removeListPlaces({ listId, savedPlaceIds })
  return result.ok ? { ok: true } : { ok: false, reason: 'failed' }
}

/**
 * 保存のシートからの入れ替え。順: ① 保存の行と今の対応を引く(無ければ `not_found`)→ ② 自分のリストの id を読み、
 * 送られた id に自分のリストに無い物が 1 つでも在れば書かずに `not_found` → ③ 入れる分を upsert(落ちたら外さず `failed`)→
 * ④ 外す分を delete(落ちたら `failed`)。まとめて戻す仕組みは持たない(入れるが先なので、失う対応は無い)。
 */
export async function runSetPlaceLists(
  input: unknown,
  env: ListCoreEnv,
): Promise<SetPlaceListsResult> {
  const parsed = placeListsInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  if (!(await env.listsOpen())) return { ok: false, reason: 'failed' }
  const db = await env.openDb()

  const saved = await db.findSavedPlace({ userId: user.id, googlePlaceId: parsed.data.googlePlaceId })
  if (!saved.ok) return { ok: false, reason: 'failed' }
  if (saved.row === null) return { ok: false, reason: 'not_found' }

  const own = await db.readOwnListIds({ userId: user.id })
  if (!own.ok) return { ok: false, reason: 'failed' }
  const ownIds = new Set(own.ids)
  if (parsed.data.listIds.some((id) => !ownIds.has(id))) return { ok: false, reason: 'not_found' }

  const current = new Set(saved.row.listIds)
  const wanted = new Set(parsed.data.listIds)
  const toAdd = parsed.data.listIds.filter((id) => !current.has(id))
  const toRemove = saved.row.listIds.filter((id) => !wanted.has(id))
  const savedPlaceId = saved.row.id

  if (toAdd.length > 0) {
    const added = await db.addListPlaces(toAdd.map((listId) => ({ listId, savedPlaceId })))
    if (!added.ok) return { ok: false, reason: 'failed' }
  }
  for (const listId of toRemove) {
    const removed = await db.removeListPlaces({ listId, savedPlaceIds: [savedPlaceId] })
    if (!removed.ok) return { ok: false, reason: 'failed' }
  }
  return { ok: true }
}
