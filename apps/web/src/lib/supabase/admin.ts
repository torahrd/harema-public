import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { clientEnv } from '@/env/client'
import { serverEnv } from '@/env/server'
import type { ResolvedPlace } from '@/lib/places/details'

/**
 * SUPABASE_SECRET_KEY を持つ admin クライアント。
 *
 * この module の外に出さない。用途は、Place Details で検証した座標の places への書込
 * (`upsertVerifiedPlace`)と、定期の取り直しの対象の取得(`claimPlaceRefreshBatch`・共有の places の
 * google_place_id を返すだけで利用者の ID は返さない)の 2 つだけ。本人の削除は DB の `begin_withdrawal()`・`finish_withdrawal()` と Firebase の
 * `accounts:delete`(本人の ID トークン)で行い、secret key では行わない。
 */
function createAdminClient() {
  return createSupabaseClient<Database>(
    clientEnv.supabaseUrl,
    serverEnv.supabaseSecretKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
}

/** Place Details の戻り値だけを受け、共有 places 行を更新する。 */
export async function upsertVerifiedPlace(place: ResolvedPlace): Promise<string> {
  if (
    !place.googlePlaceId || !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude) || place.latitude < -90 ||
    place.latitude > 90 || place.longitude < -180 || place.longitude > 180
  ) {
    throw new Error('Invalid place payload')
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('places')
    .upsert(
      {
        google_place_id: place.googlePlaceId,
        latitude: place.latitude,
        longitude: place.longitude,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'google_place_id' },
    )
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/**
 * 定期の取り直しの対象(保存されていて cached_at が古い places の google_place_id)を、DB の台帳が
 * UTC の 1 日に 1 回だけ返す(`claim_place_refresh_batch`)。呼び出しは `app/api/cron/refresh-places` の
 * CRON_SECRET の照合を通った後だけ。空文字・文字列でない値は捨てる。
 */
export async function claimPlaceRefreshBatch(limit: number): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_place_refresh_batch', { p_limit: limit })
  if (error) throw error
  return (data ?? []).flatMap((row) =>
    typeof row.google_place_id === 'string' && row.google_place_id !== ''
      ? [row.google_place_id]
      : [],
  )
}
