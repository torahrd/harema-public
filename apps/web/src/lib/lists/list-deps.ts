import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { readListIcon } from '@harema/shared/validations'
import type { ListDeps, ListRowData } from './list-core'

/**
 * `list-core.ts` の DB の依存の実体。要求ごとに作った client(`createUserSupabase()`・RLS の下)を受け取る
 * (module scope に置かない)。`userId` は核が検証済みの利用者から呼び出しごとに渡す物を、`user_id` の列と
 * `.eq('user_id', userId)` に写すだけ。admin client は使わない。
 */
export function createListDeps(supabase: SupabaseClient<Database>): ListDeps {
  return {
    insertList: async ({ userId, name, icon }) => {
      const { data, error } = await supabase
        .from('lists')
        .insert({ user_id: userId, name, icon })
        .select('id, name, icon, created_at')
        .single()
      if (error) return { ok: false, code: error.code ?? null }
      const row: ListRowData = { ...data, icon: readListIcon(data.icon) }
      return { ok: true, row }
    },
    updateList: async ({ userId, listId, patch }) => {
      const { data, error } = await supabase
        .from('lists')
        .update(patch)
        .eq('id', listId)
        .eq('user_id', userId)
        .select('id')
      if (error) return { ok: false }
      return { ok: true, found: data.length > 0 }
    },
    deleteList: async ({ userId, listId }) => {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', listId)
        .eq('user_id', userId)
      return { ok: error === null }
    },
    readOwnListIds: async ({ userId }) => {
      const { data, error } = await supabase.from('lists').select('id').eq('user_id', userId)
      if (error) return { ok: false }
      return { ok: true, ids: data.map((row) => row.id) }
    },
    findSavedPlace: async ({ userId, googlePlaceId }) => {
      const { data, error } = await supabase
        .from('saved_places')
        .select('id, places!inner(google_place_id), list_places(list_id)')
        .eq('user_id', userId)
        .eq('places.google_place_id', googlePlaceId)
        .maybeSingle()
      if (error) return { ok: false }
      if (!data) return { ok: true, row: null }
      return { ok: true, row: { id: data.id, listIds: data.list_places.map((lp) => lp.list_id) } }
    },
    addListPlaces: async (rows) => {
      const { error } = await supabase
        .from('list_places')
        .upsert(
          rows.map((row) => ({ list_id: row.listId, saved_place_id: row.savedPlaceId })),
          { onConflict: 'list_id,saved_place_id', ignoreDuplicates: true },
        )
      return { ok: error === null }
    },
    removeListPlaces: async ({ listId, savedPlaceIds }) => {
      const { error } = await supabase
        .from('list_places')
        .delete()
        .eq('list_id', listId)
        .in('saved_place_id', savedPlaceIds)
      return { ok: error === null }
    },
  }
}
