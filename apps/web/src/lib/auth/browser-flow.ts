// ブラウザ側の手順(Apple / Google でのログイン・退会の本人の確認)を、依存を引数で受ける純粋な関数にしたもの。
// 本物の依存(Firebase の JS SDK・`POST /auth/session`・`POST /auth/withdraw`)は、`lib/firebase/browser.ts` と
// `app/login/login-client.ts`・`app/account/withdraw-client.ts` が渡す。import は持たない(`core.ts`・`account-core.ts` と
// 同じ規則: 相対 import・env の読取なし。node の型除去で消せる構文だけを使い、`pnpm --filter web test` が直接読む)。
// 検査: test/browser-flow.test.mjs(LR-A6 のうち「Apple の取り消しの失敗で止まる」・LR-B2/B3 の画面側の判定の核)。

/** ログインに使える事業者。 */
export type SsoProvider = 'google' | 'apple'

/**
 * popup で入って得た資格。`refreshToken` と `accessToken` は 1 回の手順の間だけ変数に持ち、
 * どこにも保存しない(LR-B3: ブラウザの storage に更新用の鍵が残らない)。
 */
export type SsoCredential = {
  idToken: string
  refreshToken: string
  /** 事業者の OAuth の access token。Apple の取り消しに使う。取れなかったときは null。 */
  accessToken: string | null
}

/** 利用者が popup を閉じた・二重に開いた。失敗の表示を出さず、押せる状態に戻す。 */
const POPUP_CANCEL_CODES = [
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]

export function isPopupCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && POPUP_CANCEL_CODES.includes(code)
}

export const DEFAULT_NEXT_PATH = '/map'

/** サーバが判定済みの戻り先(`POST /auth/session` の応答の `next`)でも、`/` で始まる同じ origin の相対パスだけを使う。 */
export function clientNextPath(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return DEFAULT_NEXT_PATH
  if (next[1] === '/' || next[1] === '\\') return DEFAULT_NEXT_PATH
  return next
}

// ── ログイン ──────────────────────────────────────────────────────────

export type LoginOutcome =
  | { kind: 'done'; next: string }
  | { kind: 'cancelled' }
  | { kind: 'failed' }

export type LoginDeps = {
  /** popup で入る。利用者の操作(クリック)の直後に、await を挟まずに呼ばれる。失敗は throw。 */
  signIn: (provider: SsoProvider) => Promise<SsoCredential>
  /** `POST /auth/session`。通信の失敗は throw。 */
  postSession: (body: { idToken: string; refreshToken: string }) => Promise<{ status: number; next: unknown }>
  /** SDK の `signOut`(メモリ上の状態を消す)。 */
  signOut: () => Promise<void>
}

/**
 * popup で入る → ID トークンと更新用の鍵を `POST /auth/session` へ渡す → 直後に SDK の状態を消す。
 * 受付が 200 のときだけ完了。popup を閉じただけなら `cancelled`(失敗の表示なし)。それ以外の失敗は `failed`。
 * SDK の状態は、入った後の成否にかかわらず消す(消せなくても結果は変えない = メモリ上だけの状態)。
 */
export async function runSsoLogin(provider: SsoProvider, deps: LoginDeps): Promise<LoginOutcome> {
  let credential: SsoCredential
  try {
    credential = await deps.signIn(provider)
  } catch (error) {
    return isPopupCancellation(error) ? { kind: 'cancelled' } : { kind: 'failed' }
  }
  try {
    const response = await deps.postSession({
      idToken: credential.idToken,
      refreshToken: credential.refreshToken,
    })
    if (response.status !== 200) return { kind: 'failed' }
    return { kind: 'done', next: clientNextPath(response.next) }
  } catch {
    return { kind: 'failed' }
  } finally {
    await deps.signOut().catch(() => undefined)
  }
}

// ── 退会の本人の確認 ──────────────────────────────────────────────────

export type SubmitWithdrawResult = 'done' | 'unauthenticated' | 'reauth_required' | 'failed'

export type WithdrawOutcome =
  | { kind: 'done' }
  | { kind: 'unauthenticated' }
  | { kind: 'cancelled' }
  | { kind: 'failed' }

export type WithdrawDeps = {
  /** popup で入り直す(ログインに使った事業者で)。失敗は throw。 */
  signIn: (provider: SsoProvider) => Promise<SsoCredential>
  /** Apple の access token の取り消し(SDK の `revokeAccessToken`)。失敗は throw。 */
  revokeApple: (accessToken: string) => Promise<void>
  /** `POST /auth/withdraw`(再認証の ID トークンを渡す)。 */
  submit: (idToken: string) => Promise<SubmitWithdrawResult>
  signOut: () => Promise<void>
}

/**
 * 退会の順の最初の段(PLAN §0.3): popup で入り直す → Apple だけ取り消し → `POST /auth/withdraw`。
 * Apple の access token が取れない・取り消しに失敗したら、要求を送らずに止める(何も消えていないのでやり直せる)。
 * popup を閉じただけなら `cancelled`(失敗の表示なし)。サーバの 401 は `unauthenticated`、完了は `done`、
 * それ以外(再認証の拒否の 403・印を書けなかった 500・通信の失敗)は `failed`(表示は 1 つだけ)。
 */
export async function runReauthWithdraw(provider: SsoProvider, deps: WithdrawDeps): Promise<WithdrawOutcome> {
  let credential: SsoCredential
  try {
    credential = await deps.signIn(provider)
  } catch (error) {
    return isPopupCancellation(error) ? { kind: 'cancelled' } : { kind: 'failed' }
  }
  try {
    if (provider === 'apple') {
      if (credential.accessToken === null || credential.accessToken === '') return { kind: 'failed' }
      await deps.revokeApple(credential.accessToken)
    }
    const result = await deps.submit(credential.idToken)
    if (result === 'done') return { kind: 'done' }
    if (result === 'unauthenticated') return { kind: 'unauthenticated' }
    return { kind: 'failed' }
  } catch {
    return { kind: 'failed' }
  } finally {
    await deps.signOut().catch(() => undefined)
  }
}
