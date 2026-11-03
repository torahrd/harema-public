import 'server-only'

import { PLACE_REFRESH_DAILY_LIMIT } from '@harema/shared/constants'
import { serverEnv } from '@/env/server'
import { isAuthorizedCronRequest } from '@/lib/cron/cron-auth'
import { fetchPlaceLocation } from '@/lib/places/details'
import { runPlaceRefreshBatch } from '@/lib/places/refresh-batch'
import { claimPlaceRefreshBatch, upsertVerifiedPlace } from '@/lib/supabase/admin'

/**
 * 定期の取り直し(Vercel Cron が 1 日 1 回、production の配備に GET を送る)。
 * 保存されていて古い店の座標を取り直す(Essentials の `id,location` だけ)。消す側は DB の毎時の処理で、
 * ここが止まっても規約の 30 日は守られる。
 *
 * 照合に合わなければ DB にも Google にも触れずに本文なしの 401。対象の選択は DB の台帳が UTC の 1 日に
 * 1 回・上限件数までしか返さないので、重複配信や秘密の漏れでも件数は増えない。
 * 識別子・座標を応答にもログにも出さない(件数だけ)。
 */
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), serverEnv.cronSecret)) {
    return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const result = await runPlaceRefreshBatch(
      {
        claim: () => claimPlaceRefreshBatch(PLACE_REFRESH_DAILY_LIMIT),
        fetchLocation: fetchPlaceLocation,
        upsert: upsertVerifiedPlace,
      },
      { concurrency: 5 },
    )
    console.log(
      `places.refresh_batch picked=${result.picked} refreshed=${result.refreshed} missing=${result.missing} failed=${result.failed}`,
    )
    return emptyResponse(204)
  } catch {
    // claim の失敗(DB)。原因の内容は出さない。
    console.log('places.refresh_batch claim_failed')
    return emptyResponse(500)
  }
}

function emptyResponse(status: 204 | 500): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
}
