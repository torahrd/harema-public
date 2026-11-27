'use server'

import { revalidatePath } from 'next/cache'
import { readAgreementState } from '@/lib/auth/consent-notice'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'
import {
  runChangeListPlaces,
  runCreateList,
  runDeleteList,
  runSetPlaceLists,
  runUpdateList,
  type ChangeListPlacesResult,
  type CreateListResult,
  type DeleteListResult,
  type ListCoreEnv,
  type SetPlaceListsResult,
  type UpdateListResult,
} from '@/lib/lists/list-core'
import { createListDeps } from '@/lib/lists/list-deps'

/**
 * リストの書き込みの Server Action(5 つ)。順序(shared の Zod → `getVerifiedUser()` → `createUserSupabase()` → DB)は
 * 核(`lib/lists/list-core.ts`)が持つ。ここは核に依存を渡して結果を返すだけ。Supabase client は要求ごとに作る
 * (module scope に置かない)。admin client は使わない。結果は投げずに `{ ok, ... }` で返す。
 *
 * 取り直し: 作る・変える・消す・一括の 4 つは、成功の枝でだけ `revalidatePath`(`/map`・`/saved`・`/lists`)を呼ぶ(client は `router.refresh()` を呼ばない)。
 * `setPlaceLists` は呼ばない(保存の流れが今も行う `router.refresh()` 1 回に任せる)。
 */

export type {
  ChangeListPlacesResult,
  CreateListResult,
  DeleteListResult,
  SetPlaceListsResult,
  UpdateListResult,
}

/**
 * 利用者の確かめは `getVerifiedUser`。リストを開いてよいかは DB の `agreement_state()` の `lists_open`(`readAgreementState`。
 * 失敗は閉じる側)。client は `listsOpen` と `openDb` が呼ばれた時に、要求ごとに作る。
 */
function env(): ListCoreEnv {
  return {
    getUser: getVerifiedUser,
    listsOpen: async () => (await readAgreementState(await createUserSupabase())).listsOpen,
    openDb: async () => createListDeps(await createUserSupabase()),
  }
}

function revalidateListPages(): void {
  revalidatePath('/map')
  revalidatePath('/saved')
  revalidatePath('/lists')
}

export async function createList(input: unknown): Promise<CreateListResult> {
  const result = await runCreateList(input, env())
  if (result.ok) revalidateListPages()
  return result
}

export async function updateList(input: unknown): Promise<UpdateListResult> {
  const result = await runUpdateList(input, env())
  if (result.ok) revalidateListPages()
  return result
}

export async function deleteList(input: unknown): Promise<DeleteListResult> {
  const result = await runDeleteList(input, env())
  if (result.ok) revalidateListPages()
  return result
}

export async function changeListPlaces(input: unknown): Promise<ChangeListPlacesResult> {
  const result = await runChangeListPlaces(input, env())
  if (result.ok) revalidateListPages()
  return result
}

export async function setPlaceLists(input: unknown): Promise<SetPlaceListsResult> {
  return await runSetPlaceLists(input, env())
}
