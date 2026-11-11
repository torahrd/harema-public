import 'server-only'

import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { guardedLookup } from '@/lib/ogp/fetch-og-title'
import { claimOgpFetch, completeOgpFetch } from '@/lib/ogp/fetch-throttle'
import { readRedirectLocation, type ShareResolveDeps } from './share-resolve-core'

/**
 * `runShareResolve`(`share-resolve-core.ts`)の実体の deps。要求ごとの client と検証済みの `userId`
 * (`getVerifiedUser()` 由来)を受けて作る。client は module scope に置かない。
 *
 * 抑制の台帳は出典のタイトルの取得と同じ(同じ上限)。鍵は `share-resolve:` を前に付けた URL の HMAC で、
 * 出典のタイトルの取得の鍵と重ならない。
 */
export function createShareResolveDeps(
  supabase: SupabaseClient<Database>,
  userId: string,
): ShareResolveDeps {
  return {
    claim: (canonicalUrl) => claimOgpFetch(supabase, userId, `share-resolve:${canonicalUrl}`),
    fetchLocation: async (id) => {
      // 解決先 IP の検証は出典のタイトルの取得と同じ表(guardedLookup)。要求ごとに作って捨てる。
      const agent = new HttpsAgent({ lookup: guardedLookup, keepAlive: false })
      try {
        return await readRedirectLocation(httpsRequest, id, { agent })
      } finally {
        agent.destroy()
      }
    },
    complete: (key, name) => completeOgpFetch(supabase, key, name),
  }
}
