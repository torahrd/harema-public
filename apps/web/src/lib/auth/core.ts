/**
 * ログインの純粋な核(Firebase の ID トークンの検証・暗号化した cookie・更新の分類・
 * getVerifiedUser の判定・POST /auth/session の受付・ログイン後の戻り先の判定)。
 *
 * 置き方の約束(検査 LR-A1〜A4・A10 を `node --test` で走らせるため):
 * - import は `node:` の組み込みだけ。相対 import・`@/`・`server-only`・`next/*`・env の読取を持たない。
 * - 型は `import type` で読み、`enum`・`namespace`・引数のプロパティなど、型除去で消せない構文を使わない。
 * - env の値(鍵・project)は呼び出し側が引数で渡す。env の名前をこのファイルに書かない。
 * - 外向きの通信(x509 の取得・更新)は deps として受ける。実体は firebase.ts が渡す。
 *
 * 守るもの(製品 S): 署名・iss・aud・期限を検証していない値を認可に使わない。
 * 検証に失敗する側へ倒す(fail-closed)。ただし「一時の失敗」と「確定した失効」は分け、
 * 一時の失敗では cookie を消さない(一覧の取得の失敗・通信の失敗・5xx で全員をログアウトさせない)。
 */
import {
  X509Certificate,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  verify as cryptoVerify,
} from 'node:crypto'
import type { KeyObject } from 'node:crypto'

// ── 定数 ─────────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = 'harema_session'
/** ログインの有効(auth_time から 30 日)。DB の `session_ok()` と同じ値。 */
export const SESSION_LIFETIME_SEC = 30 * 24 * 60 * 60
/** `POST /auth/session` が受ける auth_time の新しさ。 */
export const LOGIN_ACCEPT_WINDOW_SEC = 5 * 60
/** ID トークンの残りがこれ未満なら取り直す。 */
export const REFRESH_THRESHOLD_SEC = 5 * 60
/** 時計のずれの許容(iat・auth_time が「過去」であることの判定だけ)。 */
export const CLOCK_SKEW_SEC = 30
/**
 * 受け付けるトークンの長さの上限。cookie は 1 本に収める(ブラウザの上限は 1 本 4096 byte 前後)。
 * 本物の Firebase の ID トークンは 1.2〜1.6 KB 程度。
 */
export const ID_TOKEN_MAX_LENGTH = 2000
export const REFRESH_TOKEN_MAX_LENGTH = 600
const COOKIE_VALUE_MAX_LENGTH = 3900
const LOGIN_BODY_MAX_LENGTH = 8192
/** 一覧に無い kid での取り直しの最短の間隔(外から kid を変えて Google への通信を増やされないため)。 */
const KEY_REFETCH_MIN_INTERVAL_MS = 10_000
const KEY_TTL_MIN_SEC = 60
const KEY_TTL_MAX_SEC = 24 * 60 * 60

// ── 共通 ─────────────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

function decodeJsonPart(part: string): JsonObject | null {
  if (!BASE64URL.test(part)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isNonEmptyString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isEpochSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

// ── ID トークンの検証(LR-A1) ─────────────────────────────────────────

export type KeyLookup =
  | { ok: true; key: KeyObject }
  | { ok: false; reason: 'unknown_kid' | 'keys_unavailable' }

export type VerifyFailure =
  | 'malformed'
  | 'alg'
  | 'kid'
  | 'keys_unavailable'
  | 'signature'
  | 'claims'
  | 'expired'
  | 'issued_in_future'
  | 'auth_time'
  | 'stale_login'

/** ログインに使った事業者。ID トークンの `firebase.sign_in_provider`(署名の検証の後に読む)。表示の出し分け用で、認可には使わない。 */
export type SignInProvider = 'google' | 'apple'

export type IdTokenClaims = {
  iss: string
  aud: string
  sub: string
  exp: number
  iat: number
  auth_time: number
  /** `google.com` → 'google'・`apple.com` → 'apple'・それ以外と欠落は null。 */
  provider: SignInProvider | null
}

function providerFromPayload(payload: JsonObject): SignInProvider | null {
  const firebase = payload.firebase
  if (!isObject(firebase)) return null
  const provider = firebase.sign_in_provider
  if (provider === 'google.com') return 'google'
  if (provider === 'apple.com') return 'apple'
  return null
}

export type VerifyResult =
  | { ok: true; claims: IdTokenClaims }
  | { ok: false; reason: VerifyFailure }

export type VerifyOptions = {
  /** Firebase の project ID(iss と aud の期待値)。 */
  projectId: string
  nowSec: number
  getKey: (kid: string) => Promise<KeyLookup>
  /** 指定すると、auth_time がこの秒数より古いトークンを拒む(ログインの受付と退会の再認証)。 */
  maxAuthAgeSec?: number
}

export function expectedIssuer(projectId: string): string {
  return `https://securetoken.google.com/${projectId}`
}

/**
 * Firebase の ID トークンを検証する。署名(RS256 のみ)→ iss・aud・sub・exp・iat・auth_time の順。
 * 署名が通るまで payload を信じない。alg は `RS256` 以外を一律拒む(none・HS256 の取り違えを許さない)。
 */
export async function verifyIdToken(token: string, options: VerifyOptions): Promise<VerifyResult> {
  if (typeof token !== 'string' || token.length === 0 || token.length > ID_TOKEN_MAX_LENGTH) {
    return { ok: false, reason: 'malformed' }
  }
  const parts = token.split('.')
  const [encodedHeader, encodedPayload, encodedSignature] = parts
  if (
    parts.length !== 3 ||
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    return { ok: false, reason: 'malformed' }
  }
  const header = decodeJsonPart(encodedHeader)
  if (!header) return { ok: false, reason: 'malformed' }
  if (header.alg !== 'RS256') return { ok: false, reason: 'alg' }
  const kid = header.kid
  if (!isNonEmptyString(kid, 128)) return { ok: false, reason: 'kid' }
  if (!BASE64URL.test(encodedSignature)) return { ok: false, reason: 'malformed' }

  const lookup = await options.getKey(kid)
  if (!lookup.ok) {
    return { ok: false, reason: lookup.reason === 'keys_unavailable' ? 'keys_unavailable' : 'kid' }
  }
  let signatureOk = false
  try {
    signatureOk = cryptoVerify(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii'),
      lookup.key,
      Buffer.from(encodedSignature, 'base64url'),
    )
  } catch {
    signatureOk = false
  }
  if (!signatureOk) return { ok: false, reason: 'signature' }

  const payload = decodeJsonPart(encodedPayload)
  if (!payload) return { ok: false, reason: 'malformed' }
  const { iss, aud, sub, exp, iat, auth_time: authTime } = payload
  if (iss !== expectedIssuer(options.projectId) || aud !== options.projectId) {
    return { ok: false, reason: 'claims' }
  }
  if (!isNonEmptyString(sub, 128)) return { ok: false, reason: 'claims' }
  if (!isEpochSeconds(exp) || !isEpochSeconds(iat)) return { ok: false, reason: 'claims' }
  if (exp <= options.nowSec) return { ok: false, reason: 'expired' }
  if (iat > options.nowSec + CLOCK_SKEW_SEC) return { ok: false, reason: 'issued_in_future' }
  if (!isEpochSeconds(authTime) || authTime > options.nowSec + CLOCK_SKEW_SEC) {
    return { ok: false, reason: 'auth_time' }
  }
  if (
    options.maxAuthAgeSec !== undefined &&
    options.nowSec - authTime > options.maxAuthAgeSec
  ) {
    return { ok: false, reason: 'stale_login' }
  }
  return {
    ok: true,
    claims: {
      iss: expectedIssuer(options.projectId),
      aud: options.projectId,
      sub,
      exp,
      iat,
      auth_time: authTime,
      provider: providerFromPayload(payload),
    },
  }
}

// ── 公開鍵の一覧(x509)の保持 ─────────────────────────────────────────

export type CertFetchResult = {
  /** kid → PEM の証明書(Google の x509 の一覧と同じ形)。 */
  certs: Record<string, string>
  /** 応答の `Cache-Control: max-age`(秒)。無ければ undefined。 */
  maxAgeSec: number | undefined
}

export type KeyStore = { getKey: (kid: string) => Promise<KeyLookup> }

/**
 * 公開鍵の一覧を `max-age` の間だけ保持する。一覧に無い kid が来たら 1 回だけ取り直し、
 * それでも無ければ拒む。取り直しは `KEY_REFETCH_MIN_INTERVAL_MS` に 1 回まで。
 * 取得に失敗したら `keys_unavailable`(呼び出し側は拒むが、cookie は消さない)。
 */
export function createKeyStore(options: {
  fetchCerts: () => Promise<CertFetchResult>
  nowMs?: () => number
}): KeyStore {
  const nowMs = options.nowMs ?? (() => Date.now())
  let keys = new Map<string, KeyObject>()
  let expiresAtMs = 0
  let fetchedAtMs = Number.NEGATIVE_INFINITY
  let inflight: Promise<boolean> | null = null

  function refresh(): Promise<boolean> {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const result = await options.fetchCerts()
        const next = new Map<string, KeyObject>()
        for (const [kid, pem] of Object.entries(result.certs)) {
          try {
            const key = new X509Certificate(pem).publicKey
            if (key.asymmetricKeyType === 'rsa') next.set(kid, key)
          } catch {
            // 読めない証明書は無いものとして扱う
          }
        }
        if (next.size === 0) return false
        const ttl = Math.min(
          Math.max(result.maxAgeSec ?? KEY_TTL_MAX_SEC, KEY_TTL_MIN_SEC),
          KEY_TTL_MAX_SEC,
        )
        keys = next
        fetchedAtMs = nowMs()
        expiresAtMs = fetchedAtMs + ttl * 1000
        return true
      } catch {
        return false
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  return {
    async getKey(kid) {
      const now = nowMs()
      if (now < expiresAtMs) {
        const cached = keys.get(kid)
        if (cached) return { ok: true, key: cached }
        if (now - fetchedAtMs < KEY_REFETCH_MIN_INTERVAL_MS) return { ok: false, reason: 'unknown_kid' }
      }
      // 一覧が無い・期限切れ・kid が無い(取り直しの間隔を過ぎている): 1 回だけ取り直す
      if (!(await refresh())) return { ok: false, reason: 'keys_unavailable' }
      const fresh = keys.get(kid)
      return fresh ? { ok: true, key: fresh } : { ok: false, reason: 'unknown_kid' }
    },
  }
}

// ── cookie の暗号化(LR-A2) ────────────────────────────────────────────

export type SessionKey = { id: string; key: Buffer }

export class SessionKeysError extends Error {}

/**
 * `SESSION_ENCRYPTION_KEYS` の形: `<鍵 id>:<base64 の 32 byte>` のカンマ区切り。先頭が現用
 * (暗号化に使う)で、残りは復号だけに使う。値は例外の文にも出さない。
 */
export function parseSessionKeys(raw: string): SessionKey[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  if (entries.length === 0) throw new SessionKeysError('no session encryption key')
  const keys: SessionKey[] = []
  entries.forEach((entry, index) => {
    const separator = entry.indexOf(':')
    const id = separator < 0 ? '' : entry.slice(0, separator)
    const encoded = separator < 0 ? '' : entry.slice(separator + 1)
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) {
      throw new SessionKeysError(`session encryption key #${index + 1}: invalid id`)
    }
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded) || Buffer.from(encoded, 'base64').length !== 32) {
      throw new SessionKeysError(`session encryption key #${index + 1}: must be 32 bytes in base64`)
    }
    if (keys.some((existing) => existing.id === id)) {
      throw new SessionKeysError(`session encryption key #${index + 1}: duplicate id`)
    }
    keys.push({ id, key: Buffer.from(encoded, 'base64') })
  })
  return keys
}

/** cookie の中身。`it` は検証済みの ID トークン、`rt` は Firebase の更新用の鍵。 */
export type SessionPayload = {
  v: 1
  /** 利用者 ID(ID トークンの sub)。 */
  sub: string
  /** 更新用の鍵。 */
  rt: string
  /** ID トークン。 */
  it: string
  /** ID トークンの期限(秒)。 */
  exp: number
  /** auth_time(秒)。更新で変わらない。 */
  at: number
  /** 預かり始めた時刻(秒)。ここから 30 日で cookie を消す。更新で変わらない。 */
  ts: number
}

function aad(keyId: string): Buffer {
  return Buffer.from(`${SESSION_COOKIE_NAME}.v1.${keyId}`, 'utf8')
}

export function sealSession(payload: SessionPayload, keys: readonly SessionKey[]): string {
  const current = keys[0]
  if (!current) throw new SessionKeysError('no session encryption key')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', current.key, iv)
  cipher.setAAD(aad(current.id))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const value = `v1.${current.id}.${Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64url')}`
  if (value.length > COOKIE_VALUE_MAX_LENGTH) throw new Error('session cookie too large')
  return value
}

export type OpenResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: 'malformed' | 'unknown_key' | 'tampered' | 'expired' }

function readPayload(value: unknown): SessionPayload | null {
  if (!isObject(value) || value.v !== 1) return null
  const { sub, rt, it, exp, at, ts } = value
  if (
    !isNonEmptyString(sub, 128) ||
    !isNonEmptyString(rt, REFRESH_TOKEN_MAX_LENGTH) ||
    !isNonEmptyString(it, ID_TOKEN_MAX_LENGTH) ||
    !isEpochSeconds(exp) ||
    !isEpochSeconds(at) ||
    !isEpochSeconds(ts)
  ) {
    return null
  }
  return { v: 1, sub, rt, it, exp, at, ts }
}

/** 復号して中身を確かめる。鍵 id が一覧に無い・改ざん・預かって 30 日を過ぎた cookie は拒む。 */
export function openSession(value: string, keys: readonly SessionKey[], nowSec: number): OpenResult {
  const [version, keyId, body, ...rest] = value.split('.')
  if (version !== 'v1' || !keyId || !body || rest.length > 0 || !BASE64URL.test(body)) {
    return { ok: false, reason: 'malformed' }
  }
  const key = keys.find((candidate) => candidate.id === keyId)
  if (!key) return { ok: false, reason: 'unknown_key' }
  const raw = Buffer.from(body, 'base64url')
  if (raw.length < 12 + 16 + 1) return { ok: false, reason: 'malformed' }
  let plain: string
  try {
    const decipher = createDecipheriv('aes-256-gcm', key.key, raw.subarray(0, 12))
    decipher.setAAD(aad(key.id))
    decipher.setAuthTag(raw.subarray(raw.length - 16))
    plain = Buffer.concat([
      decipher.update(raw.subarray(12, raw.length - 16)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return { ok: false, reason: 'tampered' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(plain)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const session = readPayload(parsed)
  if (!session) return { ok: false, reason: 'malformed' }
  if (nowSec >= session.ts + SESSION_LIFETIME_SEC || nowSec >= session.at + SESSION_LIFETIME_SEC) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, session }
}

export type CookieAttributes = {
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
  maxAge: number
}

/** HttpOnly・SameSite=Lax・Path=/・https のとき Secure・Max-Age は預かってから 30 日の残り。 */
export function sessionCookieAttributes(options: {
  secure: boolean
  session: Pick<SessionPayload, 'ts'>
  nowSec: number
}): CookieAttributes {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: options.secure,
    maxAge: Math.max(0, options.session.ts + SESSION_LIFETIME_SEC - options.nowSec),
  }
}

export function clearedCookieAttributes(secure: boolean): CookieAttributes {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: 0 }
}

// ── 更新の分類(LR-A3) ────────────────────────────────────────────────

export type RefreshClassification =
  | { kind: 'refreshed'; idToken: string; refreshToken: string }
  /** HTTP 400: 更新用の鍵が失効した。cookie を消す。 */
  | { kind: 'revoked' }
  /** 通信の失敗・時間切れ・429・5xx・そのほか: cookie を変えない。 */
  | { kind: 'transient' }

/**
 * Firebase の更新の応答の分類。`status` が null なら通信の失敗か時間切れ。
 * 400 だけを「失効」とする(401・403 は設定の誤りでも出るので、全員を消さない側に倒す)。
 */
export function classifyRefreshResponse(status: number | null, body: unknown): RefreshClassification {
  if (status === 400) return { kind: 'revoked' }
  if (status !== 200 || !isObject(body)) return { kind: 'transient' }
  const idToken = body.id_token
  const refreshToken = body.refresh_token
  if (!isNonEmptyString(idToken, ID_TOKEN_MAX_LENGTH) || !isNonEmptyString(refreshToken, REFRESH_TOKEN_MAX_LENGTH)) {
    return { kind: 'transient' }
  }
  return { kind: 'refreshed', idToken, refreshToken }
}

export function needsRefresh(session: Pick<SessionPayload, 'exp'>, nowSec: number): boolean {
  return session.exp - nowSec < REFRESH_THRESHOLD_SEC
}

export type CookieChange =
  | { kind: 'none' }
  | { kind: 'clear' }
  | { kind: 'set'; value: string }

export type UpdateDeps = {
  keys: readonly SessionKey[]
  nowSec: number
  /** 更新の通信。`status` が null なら通信の失敗か時間切れ。 */
  fetchRefresh: (refreshToken: string) => Promise<{ status: number | null; body: unknown }>
  verifyIdToken: (token: string) => Promise<VerifyResult>
}

/**
 * proxy の更新。cookie を開き、ID トークンの残りが 5 分未満なら取り直して cookie を書き直す。
 * - 開けない・預かって 30 日を過ぎた → 消す。
 * - 400 → 消す。通信の失敗・時間切れ・429・5xx・応答の不備 → 変えない(Set-Cookie を出さない)。
 * - 取り直した ID トークンは署名・iss・aud を検証し、sub と auth_time が元と同じときだけ受ける。
 *   auth_time は更新で変わらない値で、変わったトークンで 30 日の起点を延ばさせない。
 */
export async function updateSessionCookie(
  raw: string | undefined,
  deps: UpdateDeps,
): Promise<{ session: SessionPayload | null; change: CookieChange }> {
  if (raw === undefined || raw === '') return { session: null, change: { kind: 'none' } }
  const opened = openSession(raw, deps.keys, deps.nowSec)
  if (!opened.ok) return { session: null, change: { kind: 'clear' } }
  const { session } = opened
  if (!needsRefresh(session, deps.nowSec)) return { session, change: { kind: 'none' } }

  const response = await deps.fetchRefresh(session.rt)
  const classified = classifyRefreshResponse(response.status, response.body)
  if (classified.kind === 'revoked') return { session: null, change: { kind: 'clear' } }
  if (classified.kind === 'transient') return { session, change: { kind: 'none' } }

  const verified = await deps.verifyIdToken(classified.idToken)
  if (!verified.ok || verified.claims.sub !== session.sub || verified.claims.auth_time !== session.at) {
    return { session, change: { kind: 'none' } }
  }
  const next: SessionPayload = {
    ...session,
    it: classified.idToken,
    rt: classified.refreshToken,
    exp: verified.claims.exp,
  }
  let value: string
  try {
    value = sealSession(next, deps.keys)
  } catch {
    return { session, change: { kind: 'none' } }
  }
  return { session: next, change: { kind: 'set', value } }
}

// ── getVerifiedUser の判定(LR-A4) ─────────────────────────────────────

export type VerifiedUser = {
  /** 利用者 ID(署名を検証した ID トークンの sub)。 */
  id: string
  authTime: number
  /** ログインに使った事業者(退会の本人の確認の出し分けに使う表示用の値)。認可には使わない。 */
  provider: SignInProvider | null
}

export type SessionValidity = 'valid' | 'invalid' | 'unavailable'

/**
 * DB の `session_is_valid()` の結果の分類。偽・PostgREST の 401/403 は「失効」、真は「有効」、
 * 通信の失敗・時間切れ・5xx・そのほかは「判定できない」(その要求だけ未ログイン・cookie は変えない)。
 */
export function classifySessionValidity(result: {
  data: unknown
  status: number
  hadError: boolean
}): SessionValidity {
  if (result.status === 401 || result.status === 403) return 'invalid'
  if (result.hadError) return 'unavailable'
  if (result.data === true) return 'valid'
  if (result.data === false) return 'invalid'
  return 'unavailable'
}

export type ResolveDeps = {
  keys: readonly SessionKey[]
  nowSec: number
  verifyIdToken: (token: string) => Promise<VerifyResult>
  /** DB の `session_is_valid()` を、この ID トークンで問う。 */
  checkSessionValidity: (idToken: string) => Promise<SessionValidity>
  clearCookie: () => void
}

/**
 * cookie から「署名を検証した利用者」を返す。DB の判定が真のときだけ利用者を返す。
 * - DB が偽: cookie を消して未ログイン。
 * - DB が判定できない・ID トークンの期限切れ・公開鍵の一覧が取れない: その要求だけ未ログイン(cookie は変えない)。
 * - cookie が開けない・署名が通らない: cookie を消して未ログイン。
 * 偽・判定できないときは、呼び出し側が secret key の操作と Place Details の呼び出しに進まない。
 */
export async function resolveVerifiedUser(
  raw: string | undefined,
  deps: ResolveDeps,
): Promise<VerifiedUser | null> {
  if (raw === undefined || raw === '') return null
  const opened = openSession(raw, deps.keys, deps.nowSec)
  if (!opened.ok) {
    deps.clearCookie()
    return null
  }
  const { session } = opened
  const verified = await deps.verifyIdToken(session.it)
  if (!verified.ok) {
    // 期限切れ(更新が一時に失敗している間)・一覧の取得の失敗・一覧に無い kid(鍵の入れ替わり直後)は、確定した失効ではない
    if (verified.reason !== 'expired' && verified.reason !== 'keys_unavailable' && verified.reason !== 'kid') {
      deps.clearCookie()
    }
    return null
  }
  if (verified.claims.sub !== session.sub) {
    deps.clearCookie()
    return null
  }
  const validity = await deps.checkSessionValidity(session.it)
  if (validity === 'invalid') {
    deps.clearCookie()
    return null
  }
  if (validity === 'unavailable') return null
  return { id: verified.claims.sub, authTime: verified.claims.auth_time, provider: verified.claims.provider }
}

// ── POST /auth/session の受付(LR-B6 の判定の核) ──────────────────────

export type LoginRejection = {
  ok: false
  status: 400 | 401 | 403 | 413 | 500
  error: string
}

export type LoginAcceptance = {
  ok: true
  /** 暗号化した cookie の値。 */
  value: string
  session: SessionPayload
  /** ログインの後の戻り先(判定済み)。 */
  next: string
}

export type LoginInput = {
  origin: string | null
  contentType: string | null
  bodyText: string
}

export type LoginDeps = {
  /** `NEXT_PUBLIC_APP_URL`。Origin の照合と戻り先の判定の基準。 */
  appUrl: string
  keys: readonly SessionKey[]
  nowSec: number
  verifyIdToken: (token: string, maxAuthAgeSec: number) => Promise<VerifyResult>
}

/**
 * ブラウザが Firebase にログインした直後に渡す ID トークンと更新用の鍵を受け付ける。
 * Origin が `appUrl` の origin と一致・Content-Type が JSON・署名と iss・aud・期限が正しく・
 * auth_time が 5 分以内のときだけ cookie の値を返す。
 */
export async function acceptLogin(input: LoginInput, deps: LoginDeps): Promise<LoginAcceptance | LoginRejection> {
  let appOrigin: string
  try {
    appOrigin = new URL(deps.appUrl).origin
  } catch {
    return { ok: false, status: 500, error: 'misconfigured' }
  }
  if (input.origin !== appOrigin) return { ok: false, status: 403, error: 'forbidden_origin' }
  if (!/^application\/json\s*(;|$)/i.test(input.contentType ?? '')) {
    return { ok: false, status: 403, error: 'forbidden_content_type' }
  }
  if (input.bodyText.length > LOGIN_BODY_MAX_LENGTH) return { ok: false, status: 413, error: 'too_large' }

  let body: unknown
  try {
    body = JSON.parse(input.bodyText)
  } catch {
    return { ok: false, status: 400, error: 'invalid_body' }
  }
  if (!isObject(body)) return { ok: false, status: 400, error: 'invalid_body' }
  const { idToken, refreshToken, next } = body
  if (!isNonEmptyString(idToken, ID_TOKEN_MAX_LENGTH) || !isNonEmptyString(refreshToken, REFRESH_TOKEN_MAX_LENGTH)) {
    return { ok: false, status: 400, error: 'invalid_body' }
  }

  const verified = await deps.verifyIdToken(idToken, LOGIN_ACCEPT_WINDOW_SEC)
  if (!verified.ok) return { ok: false, status: 401, error: 'invalid_token' }

  const session: SessionPayload = {
    v: 1,
    sub: verified.claims.sub,
    rt: refreshToken,
    it: idToken,
    exp: verified.claims.exp,
    at: verified.claims.auth_time,
    ts: deps.nowSec,
  }
  let value: string
  try {
    value = sealSession(session, deps.keys)
  } catch {
    return { ok: false, status: 413, error: 'too_large' }
  }
  return { ok: true, value, session, next: safeNextPath(next, deps.appUrl) }
}

// ── ログインの後の戻り先(LR-A10) ──────────────────────────────────────

export const DEFAULT_NEXT_PATH = '/map'

/**
 * `next` は `/` で始まり、2 文字目が `/` でも `\` でもなく、制御文字を含まず、
 * `appUrl` と同じ origin のときだけ従う。それ以外は `/map`。
 */
export function safeNextPath(next: unknown, appUrl: string): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return DEFAULT_NEXT_PATH
  if (!next.startsWith('/') || next[1] === '/' || next[1] === '\\') return DEFAULT_NEXT_PATH
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return DEFAULT_NEXT_PATH
  try {
    const base = new URL(appUrl)
    const resolved = new URL(next, base)
    if (resolved.origin !== base.origin) return DEFAULT_NEXT_PATH
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return DEFAULT_NEXT_PATH
  }
}
