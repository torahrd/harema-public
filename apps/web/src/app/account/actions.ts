'use server'

import { revalidatePath } from 'next/cache'
import { usernameSchema } from '@harema/shared/validations'
import { runLogout } from '@/lib/auth/account-core'
import { revokeThisSession } from '@/lib/auth/account'
import { clearSessionCookie, createUserSupabase, getSessionIdToken, getVerifiedUser } from '@/lib/auth/session'

/**
 * WP-11 アカウント管理の Server Action(D1 ユーザー名変更・ログアウト)。
 *
 * 認可は全て getVerifiedUser()(署名・iss・aud・期限を検証した ID トークンの sub と DB の判定・spec §11.1-4)。クライアント供給の id を一切受けない。
 * profiles の更新は RLS `profiles_update_own` の下で `.eq('id', user.id)` に限る。
 * 退会(D4)は Server Action ではなく `POST /auth/withdraw`(app/auth/withdraw/route.ts)。再認証で得た ID トークンを
 * 本文で受ける口で、cookie の ID トークンだけでは退会できない。メール変更は撤去した(login-replace PLAN §0.3)。
 */

export type UpdateUsernameResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'unauthenticated' | 'failed' }

/** 成功時は cookie を消して { ok: true } を返す。遷移は client が行う。 */
export type SignOutResult = { ok: true } | { ok: false; reason: 'failed' }

/**
 * D1 ユーザー名変更。クライアント入力をサーバ側で usernameSchema(trim・不可視文字拒否・1〜15
 * コードポイント)で再検証し(spec §8)、本人の profiles 行だけを UPDATE する。UNIQUE なし = 重複許容。
 * 成功時は /map を revalidate し、ドロワーの「現在」が次の描画で新しい値になる。
 */
export async function updateUsername(
  input: { username: string },
): Promise<UpdateUsernameResult> {
  const parsed = usernameSchema.safeParse(input.username)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_input' }
  }

  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }
  const supabase = await createUserSupabase()

  const { error } = await supabase
    .from('profiles')
    .update({ username: parsed.data })
    .eq('id', user.id)
  if (error) {
    return { ok: false, reason: 'failed' }
  }

  revalidatePath('/map')
  return { ok: true }
}

/**
 * ログアウト。そのログインだけを止める失効の行を DB に書き(`revoke_this_session()`・ほかの端末のログインは止めない)、
 * 成功したときだけ cookie を消して { ok: true } を返す(LP への遷移は client)。例外・通信の失敗・時間切れは、完了と表示せず、cookie を保ち、
 * 失敗を返す(押し直せる)。開ける cookie が無いとき、または DB が「有効なログインでない」と答えたときは、
 * 止める対象が既に無いので cookie を消して成功を返す。判定は account-core の `runLogout`。
 */
export async function signOut(): Promise<SignOutResult> {
  // 開ける cookie が無い(期限切れ・壊れた cookie)なら止める対象が無い。
  if ((await getSessionIdToken()) !== null) {
    const outcome = await runLogout({
      revoke: revokeThisSession,
      log: (event) => {
        console.error(event)
      },
    })
    if (outcome === 'failed') {
      return { ok: false, reason: 'failed' }
    }
  }

  await clearSessionCookie()
  return { ok: true }
}
