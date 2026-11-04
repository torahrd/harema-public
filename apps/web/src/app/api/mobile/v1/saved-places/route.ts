import { savePlaceInputSchema } from '@harema/shared/validations'
import { handleMobileApi } from '@/lib/mobile-api/handle'
import { runSavePlace } from '@/lib/places/save-core'
import { createSavePlaceDeps } from '@/lib/places/save-deps'

/**
 * mobile の新しい店の保存。Server Action `savePlace` と同じ核(`runSavePlace`)を通る:
 * サーバが Place Details で実在と座標を確かめ、places へは用途限定の関数だけで書き、saved_places は
 * Bearer の ID トークンの client(RLS)で書く。user_id は検証済みの ID トークンの sub だけ。
 */
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return await handleMobileApi(request, async ({ user, supabase, body }) => {
    const parsed = savePlaceInputSchema.safeParse(body)
    if (!parsed.success) return { status: 400, body: { ok: false, reason: 'invalid_input' } }
    const result = await runSavePlace(parsed.data, createSavePlaceDeps(supabase, user.id))
    return { status: 200, body: result }
  })
}
