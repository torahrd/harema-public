/**
 * 保存した店の一括の状態の変更・一括の削除の核(Server Action `bulkChangeStatus`・`bulkDeleteSavedPlaces` が同じ手順を通る)。
 *
 * 順序に意味がある: **shared の Zod → `getUser()`(偽なら `unauthenticated` を返し何も書かない)→ `openDb()` → DB**。
 * `getUser` は署名・iss・aud・期限を検証した ID トークンの `sub` を返す物(`getVerifiedUser`)。
 * DB の依存は **`userId` を呼び出しごとの引数で受ける**(`list-core.ts` と同じ。未ログインの枝と `userId` の出どころを単体の検査が見られる)。
 *
 * 状態の変更(単位 lists-bulk の PLAN 1.1): client から `from`(今の状態)を受け、遷移の表(shared の `isAllowedStatusChange`)は
 * Zod の `refine` が 1 回だけ判定する(核に 2 つ目の判定は書かない)。DB は `status = from` の行だけを `to` に更新するので、
 * `from` を偽っても起きるのは「0 行」か「表が許す遷移」だけ。0 行(全部ほかの端末で既に変わっていた)は成功として返す。
 *
 * 一括の削除と §9-F2(`app/map/save-actions.ts` の `performDelete` の注釈。PLAN 1.2): 注釈の 4 つのうち、
 * 「`user_id` は検証済みの `sub` だけ」「client から来た識別子は持ち主の判定に使わない」「絞りは `user_id` の条件と RLS の 2 枚」の 3 つは守る。
 * 「`saved_places.id` を受け取らない」は一括では採らない: 他人の行の id を送っても `user_id` の条件と RLS で 0 行になり、
 * `googlePlaceId` を受ける形でも守りは同じ 2 枚で増える守りが無い。`googlePlaceId` を 100 件受けると、`places` を引き直す読みが 1 回増え、
 * `.in()` が URL に載って最長で約 5 万字になる(uuid は 100 件で約 3,700 字)。一覧が「どの行か」を指す値は `saved_places.id` で、
 * 一括の `changeListPlaces` と店舗詳細の URL が既にこの id を受けている。
 *
 * 結果に識別子も件数も返さない(`{ ok: true }` か `{ ok: false, reason }`)。値の import は shared の Zod だけ。DB・cookie は依存として受ける。
 */
import {
  bulkDeleteSavedPlacesSchema,
  bulkStatusChangeSchema,
  type BulkStatusChange,
} from '@harema/shared/validations'

type SavedPlaceStatus = BulkStatusChange['from']

export type BulkDeps = {
  /** `user_id = userId` かつ `id in savedPlaceIds` かつ `status = from` の行を `to` にする。0 行でも `ok`。 */
  updateStatus: (args: {
    userId: string
    savedPlaceIds: string[]
    from: SavedPlaceStatus
    to: SavedPlaceStatus
  }) => Promise<{ ok: boolean }>
  /** `user_id = userId` かつ `id in savedPlaceIds` の行を消す。0 行でも `ok`。 */
  deleteSavedPlaces: (args: { userId: string; savedPlaceIds: string[] }) => Promise<{ ok: boolean }>
}

export type BulkCoreEnv = {
  /** 検証済みの利用者。偽・判定不能なら null。 */
  getUser: () => Promise<{ id: string } | null>
  /** 要求ごとの DB の依存。`getUser` が通った後にだけ呼ぶ。 */
  openDb: () => Promise<BulkDeps> | BulkDeps
}

type Failure = 'invalid_input' | 'unauthenticated' | 'failed'

export type BulkChangeStatusResult = { ok: true } | { ok: false; reason: Failure }
export type BulkDeleteSavedPlacesResult = { ok: true } | { ok: false; reason: Failure }

export async function runBulkChangeStatus(
  input: unknown,
  env: BulkCoreEnv,
): Promise<BulkChangeStatusResult> {
  const parsed = bulkStatusChangeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  const db = await env.openDb()
  const { savedPlaceIds, from, to } = parsed.data
  const result = await db.updateStatus({ userId: user.id, savedPlaceIds, from, to })
  return result.ok ? { ok: true } : { ok: false, reason: 'failed' }
}

export async function runBulkDeleteSavedPlaces(
  input: unknown,
  env: BulkCoreEnv,
): Promise<BulkDeleteSavedPlacesResult> {
  const parsed = bulkDeleteSavedPlacesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_input' }
  const user = await env.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }
  const db = await env.openDb()
  const result = await db.deleteSavedPlaces({ userId: user.id, savedPlaceIds: parsed.data.savedPlaceIds })
  return result.ok ? { ok: true } : { ok: false, reason: 'failed' }
}
