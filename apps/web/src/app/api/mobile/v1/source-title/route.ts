import { mobileSourceTitleRequestSchema, sourceUrlSchema } from '@harema/shared/validations'
import { handleMobileApi } from '@/lib/mobile-api/handle'
import { runFetchSourceTitle } from '@/lib/places/save-core'
import { createFetchSourceTitleDeps } from '@/lib/places/save-deps'

/**
 * mobile の出典 URL のタイトル(og:title)。Server Action `fetchSourceTitle` と同じ核(`runFetchSourceTitle`)を通る:
 * 認証の後にサーバ側の抑制(DB の台帳)を通り、外向きの取得は SSRF の守り(`fetchOgTitle`)の中だけ。
 */
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return await handleMobileApi(request, async ({ user, supabase, body }) => {
    const parsedBody = mobileSourceTitleRequestSchema.safeParse(body)
    if (!parsedBody.success) return { status: 400, body: { ok: false, reason: 'invalid_input' } }
    const parsedUrl = sourceUrlSchema.safeParse(parsedBody.data.url)
    // URL として解釈できない自由記述は取りに行かない(呼び出し側はそのまま source_text として扱う)
    if (!parsedUrl.success) return { status: 200, body: { ok: false, reason: 'not_a_url' } }
    const result = await runFetchSourceTitle(parsedUrl.data, createFetchSourceTitleDeps(supabase, user.id))
    return { status: 200, body: result }
  })
}
