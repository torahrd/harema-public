'use server'

import { revalidatePath } from 'next/cache'
import { recordCurrentAgreement } from '@/lib/auth/consent-notice'
import { createUserSupabase, getVerifiedUser } from '@/lib/auth/session'

/**
 * 「改定のお知らせ」の「続ける」。今のバージョンへの同意を記録する(`agree_current()` を引数なしで呼ぶ。番号も日時も DB が決める)。
 * 認可は getVerifiedUser()(署名・iss・aud・期限を検証した ID トークンの sub と DB の判定)。クライアントからは何も受けない
 * (番号も時刻も ID も)。`failed` と `skipped`(記録の相手が無い)は値で返し、画面は閉じずに押し直せる。
 */
export async function agreeToCurrentRevision(): Promise<{ ok: boolean }> {
  const user = await getVerifiedUser()
  if (!user) return { ok: false }
  const result = await recordCurrentAgreement(await createUserSupabase())
  if (result !== 'recorded' && result !== 'already') return { ok: false }
  revalidatePath('/map')
  return { ok: true }
}
