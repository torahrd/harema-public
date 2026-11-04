/**
 * mobile 用の受け口(`/api/mobile/v1/*`)の純粋な核。受け口の判定の順はここだけが持つ
 * (`handle.ts` は `server-only` で node の試験が読めないので、順を置かない)。
 *
 * 置き方の約束(`lib/auth/core.ts` と同じ): import を持たない。型は structural に自分で宣言する。env・cookie・Next の API を読まない。
 *
 * 守るもの(製品 S): ログインが通るまで、本文の検証・Places・admin・OGP・DB の書込に進まない。
 * - 判定の順: POST 以外 405(route は POST だけを export するので、実際は Next.js が先に header なしの 405 を返す。
 *   ここは包みを他から呼んだときの守り)→ Content-Type が application/json でない 415 →
 *   Authorization が無い・形が違う 401 → `verifyToken`(署名・期限・DB の失効。401 / 503)→
 *   (ここで初めて本文を読む)本文が長すぎる 413 → JSON でない 400 → `createClient(token)` → `handler`。
 *   本文はログインが通った後にだけ `readBody` で読み、上限を超えたら読むのをやめる(`readBoundedText`)。
 *   ログインの無い者(形だけの `Bearer x` を含む)には本文を送らせて待たせない(Codex Security Review 2026-11-03)。
 * - 認証が通らない(401 / 503)とき、`createClient` も `handler` も呼ばない。
 * - すべての応答に `Cache-Control: no-store`。401 には `WWW-Authenticate: Bearer`。`Set-Cookie` と `Access-Control-*` は付けない
 *   (cookie を使わないので CSRF の資格が付かない。CORS の許可を返さないのでブラウザの別の origin は Authorization 付きで呼べない)。
 * - 失敗の本文は固定の `{ ok: false, error: '<符号>' }` だけ。例外・Google の応答・内部の文を出さない。
 */

/** 本文の長さの上限(文字数)。 */
export const MOBILE_API_BODY_MAX_LENGTH = 8192

/** 本文を読むときの byte の上限(UTF-8 の 1 文字は最大 4 byte)。これを超えたら読むのをやめる。 */
export const MOBILE_API_BODY_MAX_BYTES = MOBILE_API_BODY_MAX_LENGTH * 4

/**
 * 本文の stream を、byte の上限を数えながら読む。上限を超えたら stream を cancel して null を返す
 * (全部を溜めてから長さを比べない)。stream が無ければ空文字。
 */
export async function readBoundedText(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | null> {
  if (stream === null) return ''
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/** Authorization の header から ID トークンを取り出す関数(`lib/auth/core.ts` の `parseBearerAuthorization`)。 */
export type ParseBearer = (header: string | null) => string | null

export type MobileApiRequestInput = {
  method: string
  contentType: string | null
  authorization: string | null
  /** 本文を読む(上限を超えたら null)。ID トークンの検証が通った後にだけ呼ばれる。 */
  readBody: () => Promise<string | null>
}

export type MobileApiRequestFailure = {
  ok: false
  status: 400 | 401 | 405 | 413 | 415
  error: 'method_not_allowed' | 'unsupported_media_type' | 'payload_too_large' | 'unauthenticated' | 'invalid_json'
}

export type MobileApiHeadParsed = { ok: true; token: string } | MobileApiRequestFailure
export type MobileApiBodyParsed = { ok: true; body: unknown } | MobileApiRequestFailure

const JSON_CONTENT_TYPE = /^application\/json\s*(?:;.*)?$/i

/**
 * header だけの判定(本文は読まない・トークンの中身の検証はしない)。405 → 415 → 401。
 * `parseBearer` は呼び出し側が渡す(この file は import を持たないため)。
 */
export function parseMobileApiHead(
  input: Pick<MobileApiRequestInput, 'method' | 'contentType' | 'authorization'>,
  parseBearer: ParseBearer,
): MobileApiHeadParsed {
  if (input.method !== 'POST') return { ok: false, status: 405, error: 'method_not_allowed' }
  if (input.contentType === null || !JSON_CONTENT_TYPE.test(input.contentType)) {
    return { ok: false, status: 415, error: 'unsupported_media_type' }
  }
  const token = parseBearer(input.authorization)
  if (token === null) return { ok: false, status: 401, error: 'unauthenticated' }
  return { ok: true, token }
}

/** 本文の判定。413 → 400。ログインが通った後にだけ呼ぶ(`runMobileApi`)。 */
export async function parseMobileApiBody(readBody: MobileApiRequestInput['readBody']): Promise<MobileApiBodyParsed> {
  let bodyText: string | null
  try {
    bodyText = await readBody()
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' }
  }
  if (bodyText === null || bodyText.length > MOBILE_API_BODY_MAX_LENGTH) {
    return { ok: false, status: 413, error: 'payload_too_large' }
  }
  try {
    return { ok: true, body: JSON.parse(bodyText) as unknown }
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' }
  }
}

/** 全ての応答の header。`Set-Cookie` と `Access-Control-*` は付けない。 */
export function mobileApiHeaders(status: number): Record<string, string> {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer'
  if (status === 405) headers.Allow = 'POST'
  return headers
}

/**
 * ID トークンの検証の失敗 → HTTP の status。確定した拒否(署名・期限・失効)は 401、
 * 一時の失敗(公開鍵の一覧・DB が判定できない)は 503。知らない理由は 401(fail-closed)。
 */
export function statusForTokenFailure(reason: string): 401 | 503 {
  return reason === 'keys_unavailable' || reason === 'session_unavailable' ? 503 : 401
}

export type MobileApiResult = { status: number; body: unknown }
export type MobileApiOutput = { status: number; body: unknown; headers: Record<string, string> }

export type TokenVerification<TUser> =
  | { ok: true; user: TUser }
  | { ok: false; reason: string }

export type MobileApiDeps<TUser, TClient> = {
  /** Authorization の header の読み取り(`parseBearerAuthorization`)。 */
  parseBearer: ParseBearer
  /** `getVerifiedUserFromToken`(署名・iss・aud・期限・DB の失効の判定)。 */
  verifyToken: (token: string) => Promise<TokenVerification<TUser>>
  /** 要求ごとの client(module scope に置かない)。認証が通った後にだけ呼ぶ。 */
  createClient: (token: string) => TClient
  handler: (context: { user: TUser; supabase: TClient; body: unknown }) => Promise<MobileApiResult>
}

function output(status: number, body: unknown): MobileApiOutput {
  return { status, body, headers: mobileApiHeaders(status) }
}

function failure(status: number, error: string): MobileApiOutput {
  return output(status, { ok: false, error })
}

/**
 * 受け口の順そのもの。`handleMobileApi`(`handle.ts`)はこれを呼ぶだけ。
 * handler が投げたら 500 と固定の本文(例外の文を含めない)。
 */
export async function runMobileApi<TUser, TClient>(
  input: MobileApiRequestInput,
  deps: MobileApiDeps<TUser, TClient>,
): Promise<MobileApiOutput> {
  const head = parseMobileApiHead(input, deps.parseBearer)
  if (!head.ok) return failure(head.status, head.error)

  let verification: TokenVerification<TUser>
  try {
    verification = await deps.verifyToken(head.token)
  } catch {
    // 検証そのものが投げた(設定・通信の想定外)。確かめられないので先へ進まない
    return failure(503, 'unavailable')
  }
  if (!verification.ok) {
    const status = statusForTokenFailure(verification.reason)
    return failure(status, status === 401 ? 'unauthenticated' : 'unavailable')
  }

  // 本文はログインが通った後にだけ読む
  const parsed = await parseMobileApiBody(input.readBody)
  if (!parsed.ok) return failure(parsed.status, parsed.error)

  try {
    const supabase = deps.createClient(head.token)
    const result = await deps.handler({ user: verification.user, supabase, body: parsed.body })
    return output(result.status, result.body)
  } catch {
    return failure(500, 'internal')
  }
}
