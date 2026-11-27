import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import type { BulkDeps } from './bulk-core'

/**
 * `bulk-core.ts` の DB の依存の実体。要求ごとに作った client(`createUserSupabase()`・RLS の下)を受け取る
 * (module scope に置かない)。`userId` は核が検証済みの利用者から呼び出しごとに渡す物を `.eq('user_id', userId)` に写すだけ。
 * 絞りは `user_id` の条件と RLS(`saved_places` の update / delete は `session_ok()` かつ `user_id = sub`)の 2 枚。admin client は使わない。
 * `list_places` の行は FK の `on delete cascade` で一緒に消える(1 件の削除と同じ)。
 */
export function createBulkDeps(supabase: SupabaseClient<Database>): BulkDeps {
  return {
    updateStatus: async ({ userId, savedPlaceIds, from, to }) => {
      const { error } = await supabase
        .from('saved_places')
        .update({ status: to })
        .eq('user_id', userId)
        .in('id', savedPlaceIds)
        .eq('status', from)
      return { ok: error === null }
    },
    deleteSavedPlaces: async ({ userId, savedPlaceIds }) => {
      const { error } = await supabase
        .from('saved_places')
        .delete()
        .eq('user_id', userId)
        .in('id', savedPlaceIds)
      return { ok: error === null }
    },
  }
}
