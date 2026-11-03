// アカウント操作(ログアウト・退会・Onboarding の完了と中止)の手順を、依存を引数で受ける純粋な関数にしたもの。
// 本物の依存(DB の呼び出し・Firebase の削除・cookie の操作)は server-only の別ファイル(account.ts)と
// Server Action / Route Handler が渡す。import は持たない(`core.ts` と同じ規則: 相対 import・`server-only`・
// env の読取なし。node の型除去で消せる構文だけを使い、`pnpm --filter web test` が直接読む)。
// 検査: test/account-core.test.mjs(LR-A5・LR-A6・LR-A7)。

// ── 共通 ─────────────────────────────────────────────────────────────

/** 退会の再認証で得た ID トークンの auth_time の窓(秒)。ログインの受付と同じ 5 分。 */
export const REAUTH_MAX_AGE_SEC = 5 * 60
/** 退会の受付の本文の上限(文字数)。 */
export const WITHDRAW_BODY_MAX_LENGTH = 8192
/** `begin_withdrawal()`・`finish_withdrawal()` それぞれの試行の上限。初回 + 再試行 2 回(PLAN §0.3 退会の順)。 */
export const WITHDRAWAL_DB_MAX_ATTEMPTS = 3
/** `complete_onboarding` の試行の上限。初回 + 再実行 2 回(K4・再実行の回数 R = 2)。 */
export const COMPLETE_ONBOARDING_MAX_ATTEMPTS = 3

export type DbError = { code?: string | null; message?: string | null }
/** supabase-js の `rpc()`・`from()` の戻りから、分類に要る 2 つだけを取り出した形。`status` 0 は通信の失敗・時間切れ。 */
export type DbResult = { error: DbError | null; status: number }

export type DbFailureKind =
  /** 有効なログインでない(失効・期限切れ・anon)。DB の `not authenticated`。 */
  | 'not_authenticated'
  /** 同意前の行が無い(完了済み・退会済み・削除の確認済み)。DB の `no pending registration`。 */
  | 'no_pending'
  /** 毎時の削除に印を付けられた同意前の行。DB の `pending registration is being removed`。 */
  | 'being_removed'
  /** 通信の失敗・時間切れ・429・5xx。同じ要求の中で再実行してよい。 */
  | 'transient'
  | 'other'

function isTransientStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

/** DB の呼び出しの失敗の分類。拒否の文は DB-REPORT の「呼び出し側が使う口」のとおり(変えない)。 */
export function classifyDbFailure(result: DbResult): DbFailureKind {
  const raised = result.error?.code === 'P0001'
  const message = result.error?.message ?? ''
  if (raised && message.includes('not authenticated')) return 'not_authenticated'
  if (raised && message.includes('no pending registration')) return 'no_pending'
  if (raised && message.includes('pending registration is being removed')) return 'being_removed'
  if (isTransientStatus(result.status)) return 'transient'
  return 'other'
}

/** 依存が例外を投げても、通信の失敗と同じ形(status 0)の失敗にそろえる。 */
async function settle(run: () => Promise<DbResult>): Promise<DbResult> {
  try {
    return await run()
  } catch {
    return { error: { message: 'call threw' }, status: 0 }
  }
}

/** DB の呼び出しを試行の上限まで繰り返す。成功した試行があれば true。 */
async function succeedsWithin(run: () => Promise<DbResult>, maxAttempts: number): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if ((await settle(run)).error === null) return true
  }
  return false
}

/**
 * Firebase `accounts:delete` の応答が「アカウントが無い状態になった」かどうか。
 * HTTP 2xx でエラーを含まない JSON のオブジェクトは成功。HTTP の非成功のうち `USER_NOT_FOUND`
 * (既に消えている = 毎時の削除が先に消した・前の試行が実は成功していた)は成功に数える。
 * 解釈できない本体・そのほかの失敗は false。
 */
export function isAccountDeleted(status: number, body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const error = (body as { error?: unknown }).error
  if (status >= 200 && status < 300) return !('error' in body)
  if (typeof error !== 'object' || error === null) return false
  return (error as { message?: unknown }).message === 'USER_NOT_FOUND'
}

export type Log = (event: string, detail?: { sub: string }) => void

// ── ログアウト(LR-A5) ────────────────────────────────────────────────

export type LogoutDeps = {
  /** RPC `revoke_this_session()`。そのログインだけを止める失効の行を書く。 */
  revoke: () => Promise<DbResult>
  log: Log
}

/**
 * - `revoked`: 失効の行を書けた。cookie を消してよい。
 * - `already_invalid`: DB が「有効なログインでない」と答えた(失効済み・30 日超過)。止める対象が既に無いので cookie を消してよい。
 * - `failed`: 例外・通信の失敗・時間切れ・そのほか。cookie を消さず、完了と表示せず、失敗を示す。
 */
export type LogoutOutcome = 'revoked' | 'already_invalid' | 'failed'

export async function runLogout(deps: LogoutDeps): Promise<LogoutOutcome> {
  const result = await settle(deps.revoke)
  if (result.error === null) return 'revoked'
  if (classifyDbFailure(result) === 'not_authenticated') return 'already_invalid'
  deps.log('logout.revoke_failed')
  return 'failed'
}

// ── Onboarding の完了の再実行(LR-A7・K4) ───────────────────────────────

export type ProfileState = 'exists' | 'absent' | 'unknown'

export type CompleteDeps = {
  /** 本人の profiles の行の有無。問い合わせが失敗したら `unknown`。 */
  findProfile: () => Promise<ProfileState>
  /** RPC `complete_onboarding`。 */
  callRpc: () => Promise<DbResult>
  /** 再実行の前の待ち(ミリ秒)。検査では即時に返す。 */
  wait: (ms: number) => Promise<void>
  maxAttempts?: number
}

export type CompleteOutcome =
  | { status: 'completed'; rpcCalls: number }
  | { status: 'failed'; kind: DbFailureKind; rpcCalls: number }

/**
 * 完了の手順。profiles が既にあれば RPC を呼ばず成功(二重登録のガード)。
 * RPC が失敗したら profiles を引き直し、あれば成功(1 回目が実は成功していた・別のタブで先に完了していた・
 * 同意前の行が既に無い)。無くて一時の失敗(通信の失敗・時間切れ・429・5xx)のときだけ、同じ要求の中で再実行する。
 * ほかの失敗(23505 を含む)は成功に畳まない。再同意は要らない(同意の値は画面の申告で、要求を離れていない)。
 */
export async function runCompleteOnboarding(deps: CompleteDeps): Promise<CompleteOutcome> {
  const maxAttempts = deps.maxAttempts ?? COMPLETE_ONBOARDING_MAX_ATTEMPTS
  if ((await deps.findProfile()) === 'exists') return { status: 'completed', rpcCalls: 0 }

  let rpcCalls = 0
  for (let attempt = 1; ; attempt += 1) {
    const result = await settle(deps.callRpc)
    rpcCalls += 1
    if (result.error === null) return { status: 'completed', rpcCalls }

    const kind = classifyDbFailure(result)
    if ((await deps.findProfile()) === 'exists') return { status: 'completed', rpcCalls }
    if (kind !== 'transient' || attempt >= maxAttempts) return { status: 'failed', kind, rpcCalls }
    await deps.wait(300 * attempt)
  }
}

// ── 退会の受付と手順(LR-A6) ──────────────────────────────────────────

export type WithdrawRequestInput = {
  origin: string | null
  contentType: string | null
  bodyText: string
}

export type WithdrawRequestRejection = { ok: false; status: 400 | 403 | 413 | 500; error: string }

/**
 * `POST /auth/withdraw` の入り口の判定。Origin が `appUrl` の origin と一致・JSON の Content-Type・
 * 本文が上限以内・`{idToken}` を持つ。ID トークンの検証はしない(`runWithdraw` が行う)。
 * cookie の中身は受け取らない — 本文に再認証の ID トークンが無ければ 400 で、cookie だけでは退会できない。
 */
export function parseWithdrawRequest(
  input: WithdrawRequestInput,
  appUrl: string,
): { ok: true; idToken: string } | WithdrawRequestRejection {
  let appOrigin: string
  try {
    appOrigin = new URL(appUrl).origin
  } catch {
    return { ok: false, status: 500, error: 'misconfigured' }
  }
  if (input.origin !== appOrigin) return { ok: false, status: 403, error: 'forbidden_origin' }
  if (!/^application\/json\s*(;|$)/i.test(input.contentType ?? '')) {
    return { ok: false, status: 403, error: 'forbidden_content_type' }
  }
  if (input.bodyText.length > WITHDRAW_BODY_MAX_LENGTH) return { ok: false, status: 413, error: 'too_large' }

  let body: unknown
  try {
    body = JSON.parse(input.bodyText)
  } catch {
    return { ok: false, status: 400, error: 'invalid_body' }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'invalid_body' }
  }
  const idToken = (body as { idToken?: unknown }).idToken
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return { ok: false, status: 400, error: 'invalid_body' }
  }
  return { ok: true, idToken }
}

export type ReauthVerdict = { ok: true; sub: string } | { ok: false }

export type WithdrawDeps = {
  /** cookie の sub(`getVerifiedUser()` が返した利用者の ID)。 */
  userId: string
  /** 再認証で得た ID トークンを検証する(署名・iss・aud・期限・auth_time が `maxAuthAgeSec` 以内)。 */
  verifyReauth: (idToken: string, maxAuthAgeSec: number) => Promise<ReauthVerdict>
  /** RPC `begin_withdrawal()`。退会の印と利用者単位の失効を 1 トランザクションで書く。渡す ID トークンは再認証のもの(cookie のトークンは 6 分以上前のことがある)。 */
  beginWithdrawal: (idToken: string) => Promise<DbResult>
  /** Firebase の `accounts:delete`(再認証の ID トークン)。成功(`USER_NOT_FOUND` を含む)だけが true。 */
  firebaseDelete: (idToken: string) => Promise<boolean>
  /** RPC `finish_withdrawal()`。4 つの表・同意前の行・ログイン単位の失効を消す。渡す ID トークンは再認証のもの。 */
  finishWithdrawal: (idToken: string) => Promise<DbResult>
  log: Log
}

/**
 * - `done`: 印を書けた後は最後まで進めた扱い。cookie を消す。Firebase の削除や `finish_withdrawal()` が
 *   失敗していても完了を返す(印の後はその sub のどのトークンも拒まれ、毎時の削除が印のある sub を片付ける)。
 * - `reauth_rejected`: 再認証のトークンが検証を通らない・sub が cookie と違う。DB も Firebase も 0 回。
 * - `begin_failed`: `begin_withdrawal()` が試行の上限の後も失敗(印を書けていない)。Firebase の削除も
 *   `finish_withdrawal()` も 0 回。何も消えていないので cookie を残し、やり直せる。
 */
export type WithdrawOutcome = 'done' | 'reauth_rejected' | 'begin_failed'

/**
 * 退会の順(PLAN §0.3・改訂 5): 再認証の検証 → `begin_withdrawal()`(印)→ Firebase の削除 →
 * `finish_withdrawal()`(行)。Apple の取り消しはブラウザが先に行う。印が戻れない位置で、
 * 印の後は取り消さず最後まで進める(失敗は完了のまま。uid だけをログに残す)。
 */
export async function runWithdraw(idToken: string, deps: WithdrawDeps): Promise<WithdrawOutcome> {
  let verdict: ReauthVerdict
  try {
    verdict = await deps.verifyReauth(idToken, REAUTH_MAX_AGE_SEC)
  } catch {
    verdict = { ok: false }
  }
  if (!verdict.ok || verdict.sub !== deps.userId) return 'reauth_rejected'

  // 印を書く(`already_marked` も成功の応答。呼び出し側は区別しない)
  if (!(await succeedsWithin(() => deps.beginWithdrawal(idToken), WITHDRAWAL_DB_MAX_ATTEMPTS))) {
    deps.log('withdraw.begin_failed')
    return 'begin_failed'
  }

  let firebaseDeleted = false
  try {
    firebaseDeleted = await deps.firebaseDelete(idToken)
  } catch {
    firebaseDeleted = false
  }
  if (!firebaseDeleted) {
    // 毎時の削除が印のある sub を Firebase から消し、行と印を片付ける
    deps.log('withdraw.firebase_delete_failed', { sub: deps.userId })
    return 'done'
  }

  if (!(await succeedsWithin(() => deps.finishWithdrawal(idToken), WITHDRAWAL_DB_MAX_ATTEMPTS))) {
    // 残る行は毎時の削除が片付ける(印の後は誰にも見えない)
    deps.log('withdraw.finish_failed', { sub: deps.userId })
  }
  return 'done'
}

// ── Onboarding の中止(LR-B9) ──────────────────────────────────────────

export type AbortDeps = {
  findProfile: () => Promise<ProfileState>
  /** RPC `begin_withdrawal()`(cookie の ID トークン。profiles の無い sub には 5 分の条件が掛からない)。 */
  beginWithdrawal: () => Promise<DbResult>
  /** Firebase の `accounts:delete`(cookie の ID トークン)。成功(`USER_NOT_FOUND` を含む)だけが true。 */
  firebaseDelete: () => Promise<boolean>
  /** RPC `finish_withdrawal()`(同意前の行と印の後の残りを消す。印の後の本人のトークンも受ける)。 */
  finishWithdrawal: () => Promise<DbResult>
  userId: string
  log: Log
}

/**
 * - `done`: 印を書けた。Firebase の削除や `finish_withdrawal()` が失敗していても完了(退会と同じ。毎時の削除が片付ける)。cookie を消す。
 * - `onboarded`: profiles に行がある。何も消さない(盗まれた cookie で中止を呼んでも、退会の再認証を迂回して既存の行を消せない)。
 * - `failed`: profiles の問い合わせが失敗した(何も消さない)、または `begin_withdrawal()` が上限の後も失敗(印を書けていない。Firebase も DB も消していない)。
 */
export type AbortOutcome =
  | { status: 'done' }
  | { status: 'onboarded' }
  | { status: 'failed'; stage: 'profile' | 'begin' }

export async function runAbortOnboarding(deps: AbortDeps): Promise<AbortOutcome> {
  const profile = await deps.findProfile()
  if (profile === 'exists') return { status: 'onboarded' }
  if (profile === 'unknown') return { status: 'failed', stage: 'profile' }

  if (!(await succeedsWithin(deps.beginWithdrawal, WITHDRAWAL_DB_MAX_ATTEMPTS))) {
    deps.log('abort.begin_failed')
    return { status: 'failed', stage: 'begin' }
  }

  let firebaseDeleted = false
  try {
    firebaseDeleted = await deps.firebaseDelete()
  } catch {
    firebaseDeleted = false
  }
  if (!firebaseDeleted) {
    deps.log('abort.firebase_delete_failed', { sub: deps.userId })
    return { status: 'done' }
  }

  if (!(await succeedsWithin(deps.finishWithdrawal, WITHDRAWAL_DB_MAX_ATTEMPTS))) {
    deps.log('abort.finish_failed', { sub: deps.userId })
  }
  return { status: 'done' }
}
