import 'server-only'

import { isAllowedStatusChange } from '@harema/shared/validations'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { claimOgpFetch, completeOgpFetch } from '@/lib/ogp/fetch-throttle'
import { fetchOgTitle } from '@/lib/ogp/fetch-og-title'
import { upsertVerifiedPlace } from '@/lib/supabase/admin'
import { fetchPlaceLocation } from './details'
import type { FetchSourceTitleDeps, SavePlaceDeps } from './save-core'

/**
 * `runSavePlace`・`runFetchSourceTitle`(`save-core.ts`)の実体の deps。Server Action(cookie の client)と
 * mobile の受け口(Bearer の client)が、要求ごとの client と検証済みの `userId` を渡して同じ物を作る。
 * client は呼び出しごとに作った物を受け取る(module scope に置かない)。
 */

export function createSavePlaceDeps(
  supabase: SupabaseClient<Database>,
  userId: string,
): SavePlaceDeps {
  return {
    userId,
    fetchPlaceLocation,
    upsertVerifiedPlace,
    isAllowedStatusChange,
    findSavedStatus: async (placeId) => {
      const { data, error } = await supabase
        .from('saved_places')
        .select('status')
        .eq('user_id', userId)
        .eq('place_id', placeId)
        .maybeSingle()
      if (error) return { ok: false }
      return { ok: true, status: data?.status ?? null }
    },
    insertSaved: async (placeId, fields) => {
      const { error } = await supabase
        .from('saved_places')
        .insert({ user_id: userId, place_id: placeId, ...fields })
      if (error) return { ok: false, conflict: error.code === '23505' }
      return { ok: true }
    },
    updateSaved: async (placeId, fields) => {
      const { error } = await supabase
        .from('saved_places')
        .update(fields)
        .eq('user_id', userId)
        .eq('place_id', placeId)
      return error === null
    },
  }
}

export function createFetchSourceTitleDeps(
  supabase: SupabaseClient<Database>,
  userId: string,
): FetchSourceTitleDeps {
  return {
    // 鍵は uid で HMAC する(利用者を跨いだ対応表を無効化する)。uid は検証済みの利用者のものだけ
    claim: (url) => claimOgpFetch(supabase, userId, url),
    fetchTitle: fetchOgTitle,
    complete: (key, title) => completeOgpFetch(supabase, key, title),
  }
}
