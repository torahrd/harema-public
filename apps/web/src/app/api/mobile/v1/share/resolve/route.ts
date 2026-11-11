import { shareResolveRequestSchema } from '@harema/shared/validations'
import { handleMobileApi } from '@/lib/mobile-api/handle'
import { runShareResolve } from '@/lib/places/share-resolve-core'
import { createShareResolveDeps } from '@/lib/places/share-resolve-deps'

/**
 * mobile の共有の拡張から、Google マップの短い URL(`maps.app.goo.gl/<id>`)をたどって店名を得る。
 * 認証の後にサーバ側の抑制(DB の台帳)を通り、外向きの接続は行き先を固定した 1 回の GET だけ
 * (転送を追わない・本文を読まない・5 秒)。URL と店名はログに残さない。
 */
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return await handleMobileApi(request, async ({ user, supabase, body }) => {
    const parsedBody = shareResolveRequestSchema.safeParse(body)
    if (!parsedBody.success) return { status: 400, body: { ok: false, reason: 'invalid_input' } }
    const result = await runShareResolve(parsedBody.data.url, createShareResolveDeps(supabase, user.id))
    return { status: 200, body: result }
  })
}
