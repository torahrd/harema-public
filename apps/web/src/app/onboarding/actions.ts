'use server'

import { completeOnboardingSchema } from '@harema/shared/validations'
import { runAbortOnboarding, runCompleteOnboarding } from '@/lib/auth/account-core'
import { beginWithdrawal, callCompleteOnboarding, finishWithdrawal, findProfileState } from '@/lib/auth/account'
import { deleteFirebaseAccount } from '@/lib/auth/firebase'
import { clearSessionCookie, getSessionIdToken, getVerifiedUser } from '@/lib/auth/session'

export type CompleteOnboardingResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'unauthenticated' | 'failed' }

export type AbortOnboardingResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'failed' | 'onboarded' }

/**
 * Onboarding 完了。クライアント入力(username)をサーバ側で再検証し(spec §8)、getVerifiedUser()
 * (§11.1-4・署名・iss・aud・期限を検証した ID トークンの sub と DB の判定)で認証を確認する。
 * 手順は account-core の `runCompleteOnboarding`: 既に profiles があれば RPC を呼ばず済扱いで成功
 * (二重登録ガード。page ガードと同じ結論=/map)。無ければ complete_onboarding RPC を呼び、profiles +
 * user_agreements を単一トランザクションで INSERT する(§6.1・同意日時は DB default now() が真実源で
 * INSERT では渡さない)。失敗したら profiles を引き直し、あれば成功(1 回目が実は成功していた・別タブで
 * 先に完了していた)。一時の失敗(通信の失敗・時間切れ・429・5xx)だけ、この要求の中で最大 2 回再実行する
 * (K4・再同意なし)。そのほかの失敗(23505 を含む)は成功に畳まない。
 */
export async function completeOnboarding(
  input: { username: string },
): Promise<CompleteOnboardingResult> {
  const parsed = completeOnboardingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_input' }
  }

  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }

  const outcome = await runCompleteOnboarding({
    findProfile: () => findProfileState(user.id),
    callRpc: () => callCompleteOnboarding(parsed.data.username),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  })
  if (outcome.status === 'completed') {
    return { ok: true }
  }
  if (outcome.kind === 'not_authenticated') {
    return { ok: false, reason: 'unauthenticated' }
  }
  return { ok: false, reason: 'failed' }
}

/**
 * Onboarding 中止。ログイン中の利用者自身を消す(spec §6.1・§11.1-3)。削除対象はクライアントから
 * 受け取らず(引数を一切取らない)、getVerifiedUser() が検証した ID トークンの sub に固定する。
 * 手順は account-core の `runAbortOnboarding`: profiles に行があれば何も消さず `onboarded`、profiles の
 * 問い合わせが失敗したら何も消さず `failed` → 退会と同じ順(PLAN §0.3・改訂 5)で、cookie の ID トークンの
 * `begin_withdrawal()`(印と失効・失敗は 2 回まで再試行し、なお失敗なら `failed`) → 同じトークンで Firebase の
 * `accounts:delete`(`USER_NOT_FOUND` は成功) → `finish_withdrawal()`(同意前の行・失敗は 2 回まで再試行)→ cookie を消す。
 * 印の後の失敗(Firebase の削除・`finish_withdrawal()`)は完了を返す(毎時の削除が片付ける)。
 * 成功時はクライアントが LP(/)へ遷移する。
 */
export async function abortOnboarding(): Promise<AbortOnboardingResult> {
  const user = await getVerifiedUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }
  const idToken = await getSessionIdToken()
  if (idToken === null) {
    return { ok: false, reason: 'unauthenticated' }
  }

  const outcome = await runAbortOnboarding({
    userId: user.id,
    findProfile: () => findProfileState(user.id),
    firebaseDelete: () => deleteFirebaseAccount(idToken),
    beginWithdrawal: () => beginWithdrawal(null),
    finishWithdrawal: () => finishWithdrawal(null),
    log: (event, detail) => {
      console.error(detail ? `${event} sub=${detail.sub}` : event)
    },
  })
  if (outcome.status === 'onboarded') {
    return { ok: false, reason: 'onboarded' }
  }
  if (outcome.status === 'failed') {
    return { ok: false, reason: 'failed' }
  }

  await clearSessionCookie()
  return { ok: true }
}
