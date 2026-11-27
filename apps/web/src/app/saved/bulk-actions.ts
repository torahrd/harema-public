'use server'

import { revalidatePath } from 'next/cache'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import {
  runBulkChangeStatus,
  runBulkDeleteSavedPlaces,
  type BulkChangeStatusResult,
  type BulkCoreEnv,
  type BulkDeleteSavedPlacesResult,
} from '@/lib/places/bulk-core'
import { createBulkDeps } from '@/lib/places/bulk-deps'

/**
 * 一覧の「選ぶ」の一括の状態の変更・一括の削除の Server Action(2 つ)。順序(shared の Zod → `getVerifiedUser()` →
 * `createUserSupabase()` → DB)は核(`lib/places/bulk-core.ts`)が持つ。ここは核に依存を渡して結果を返すだけ。
 * Supabase client は要求ごとに作る(module scope に置かない)。admin client は使わない。結果は投げずに `{ ok, ... }` で返す。
 * 取り直し: 成功の枝でだけ `revalidatePath` を呼ぶ(client は `router.refresh()` を呼ばない)。`redirect` も cookie の書込も使わない。
 */

export type { BulkChangeStatusResult, BulkDeleteSavedPlacesResult }

/** 利用者の確かめは `getVerifiedUser`。client は `openDb` が呼ばれた時に初めて作る。 */
function env(): BulkCoreEnv {
  return {
    getUser: getVerifiedUser,
    openDb: async () => createBulkDeps(await createUserSupabase()),
  }
}

function revalidateSavedPages(): void {
  revalidatePath('/map')
  revalidatePath('/saved')
}

export async function bulkChangeStatus(input: unknown): Promise<BulkChangeStatusResult> {
  const result = await runBulkChangeStatus(input, env())
  if (result.ok) revalidateSavedPages()
  return result
}

export async function bulkDeleteSavedPlaces(input: unknown): Promise<BulkDeleteSavedPlacesResult> {
  const result = await runBulkDeleteSavedPlaces(input, env())
  if (result.ok) revalidateSavedPages()
  return result
}
