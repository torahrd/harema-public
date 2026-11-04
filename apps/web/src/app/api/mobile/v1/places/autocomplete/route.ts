import {
  mobileAutocompleteRequestSchema,
  type MobileAutocompleteResponse,
} from '@harema/shared/validations'
import { handleMobileApi } from '@/lib/mobile-api/handle'
import { fetchMobileSuggestions } from '@/lib/places/mobile-places'

/**
 * mobile の検索の候補(Places Autocomplete (New))。Bearer の ID トークンが検証を通った後にだけ Google を呼ぶ。
 * 受け取るのは入力・セッションの札・地図の範囲だけで、field の mask はサーバが決める(spec §4.2)。
 */
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return await handleMobileApi(request, async ({ body }) => {
    const parsed = mobileAutocompleteRequestSchema.safeParse(body)
    if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid_input' } }
    const suggestions = await fetchMobileSuggestions(parsed.data)
    if (suggestions === null) return { status: 502, body: { ok: false, error: 'upstream_failed' } }
    const response: MobileAutocompleteResponse = { ok: true, suggestions }
    return { status: 200, body: response }
  })
}
