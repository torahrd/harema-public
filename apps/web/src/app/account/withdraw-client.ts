import {
  runReauthWithdraw,
  type SsoProvider,
  type SubmitWithdrawResult,
  type WithdrawOutcome,
} from '@/lib/auth/browser-flow'
import { prepareSso, revokeAppleAccessToken, signInWithSso, signOutBrowser } from '@/lib/firebase/browser'

/**
 * 退会のブラウザ側の部品(login-replace PLAN §0.3 退会の順)。
 *
 * 順は「本人の確認(ログインに使った事業者の popup で入り直す)→ (Apple だけ)取り消し → `POST /auth/withdraw`」。
 * 手順の判定は `runReauthWithdraw`(lib/auth/browser-flow.ts)。popup で入り直すのは、cookie の ID トークンの
 * auth_time が 5 分より古いことがあるため(`reauthenticateWithPopup` は使わない = ログインの直後に SDK の状態を
 * 消しているので `currentUser` が無い)。Apple の取り消しに失敗したら要求を送らずに止める(何も消えていない)。
 * クリックの直後に呼ぶこと(popup の遮断を避けるため、呼ぶ前に await を挟まない)。
 */
/** 退会のダイアログが開いた時に呼ぶ(Safari の 1 回目の popup の遮断を避ける・prepareSso)。 */
export function prepareWithdraw(): void {
  prepareSso()
}

export function reauthenticateAndWithdraw(provider: SsoProvider): Promise<WithdrawOutcome> {
  return runReauthWithdraw(provider, {
    signIn: signInWithSso,
    revokeApple: revokeAppleAccessToken,
    submit: submitWithdraw,
    signOut: signOutBrowser,
  })
}

/**
 * `POST /auth/withdraw` に再認証の ID トークンを渡す。cookie は同じ origin のものが自動で付く。
 * 200 だけが完了(印の後の Firebase の削除や行の削除の失敗も 200 で、毎時の削除が片付ける)。401 は未ログイン、
 * 403 は再認証のやり直し、それ以外(印を書けなかった 500・通信の失敗)は失敗で、何も消えていないのでやり直せる。
 */
export async function submitWithdraw(idToken: string): Promise<SubmitWithdrawResult> {
  try {
    const response = await fetch('/auth/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (response.ok) return 'done'
    if (response.status === 401) return 'unauthenticated'
    if (response.status === 403) return 'reauth_required'
    return 'failed'
  } catch {
    return 'failed'
  }
}
