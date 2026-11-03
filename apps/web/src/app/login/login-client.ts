import { runSsoLogin, type LoginOutcome, type SsoProvider } from '@/lib/auth/browser-flow'
import { prepareSso, signInWithSso, signOutBrowser } from '@/lib/firebase/browser'

/**
 * Apple / Google のボタンの動作(login-replace・形 C)。順は `runSsoLogin`(lib/auth/browser-flow.ts):
 * popup で入る → ID トークンと更新用の鍵を `POST /auth/session` へ 1 回渡す → 直後に SDK のメモリ上の状態を消す。
 * クリックの直後に呼ぶこと(popup の遮断を避けるため、呼ぶ前に await を挟まない)。
 * 受付が 200 のときだけ完了。応答の `next` はサーバが判定した戻り先(既定 `/map`・同意前は `/map` が `/onboarding` へ送る)。
 */
/** ログインの画面が開いた時に呼ぶ(Safari の 1 回目の popup の遮断を避ける・prepareSso)。 */
export function prepareLogin(): void {
  prepareSso()
}

export function loginWithSso(provider: SsoProvider): Promise<LoginOutcome> {
  return runSsoLogin(provider, {
    signIn: signInWithSso,
    postSession: async (body) => {
      const response = await fetch('/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
        cache: 'no-store',
      })
      let next: unknown = null
      try {
        const json: unknown = await response.json()
        if (typeof json === 'object' && json !== null) next = (json as { next?: unknown }).next
      } catch {
        // 本文が JSON でなければ戻り先は既定(/map)。受付の成否は status で決める
      }
      return { status: response.status, next }
    },
    signOut: signOutBrowser,
  })
}
