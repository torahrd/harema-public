import { mobilePlaceDetailsRequestSchema } from '@harema/shared/validations'
import { handleMobileApi } from '@/lib/mobile-api/handle'
import { fetchMobilePlaceDetails } from '@/lib/places/mobile-places'

/**
 * mobile の店の情報(Places Place Details (New))。用途(purpose)ごとの mask と SKU はサーバの表が決める。
 * Bearer の ID トークンが検証を通った後にだけ Google を呼ぶ。店名・住所は保存も記録もせず、そのまま返す。
 */
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return await handleMobileApi(request, async ({ body }) => {
    const parsed = mobilePlaceDetailsRequestSchema.safeParse(body)
    if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid_input' } }
    const outcome = await fetchMobilePlaceDetails(parsed.data)
    if (outcome.kind === 'not_found') return { status: 404, body: { ok: false, error: 'place_not_found' } }
    if (outcome.kind === 'failed') return { status: 502, body: { ok: false, error: 'upstream_failed' } }
    return { status: 200, body: outcome.response }
  })
}
