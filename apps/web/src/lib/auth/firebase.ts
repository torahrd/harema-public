import 'server-only'

import { clientEnv } from '@/env/client'
import { serverEnv } from '@/env/server'
import {
  createKeyStore,
  verifyIdToken,
  type CertFetchResult,
  type KeyStore,
  type VerifyResult,
} from './core'
import { isAccountDeleted } from './account-core'

/**
 * Firebase への外向きの通信(公開鍵の一覧の取得・ID トークンの取り直し)と、その口の向け先。
 *
 * サーバに Firebase の管理の鍵は置かない。ここで使うのは公開の口だけ(公開鍵の一覧と、
 * Web API key つきの更新・本人の ID トークンつきの操作)。
 * local の検査では `FIREBASE_AUTH_ORIGIN_OVERRIDE`・`FIREBASE_X509_URL_OVERRIDE`(発行の口)へ向ける。
 * この 2 つが `VERCEL` のある環境で設定されていれば env の検証が起動を失敗させる(env/server.ts)。
 */

const SECURETOKEN_ORIGIN = 'https://securetoken.googleapis.com'
const IDENTITYTOOLKIT_ORIGIN = 'https://identitytoolkit.googleapis.com'
const X509_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

const KEYS_TIMEOUT_MS = 5_000
const REFRESH_TIMEOUT_MS = 5_000
const ACCOUNT_DELETE_TIMEOUT_MS = 5_000

/** 向け先。`accounts(op)` は退会・Onboarding の中止が使う(例 `accounts('delete')`)。 */
export function firebaseEndpoints(): {
  token: string
  accounts: (operation: string) => string
  x509: string
} {
  const override = serverEnv.firebaseAuthOriginOverride
  return {
    token: new URL('/v1/token', override ?? SECURETOKEN_ORIGIN).toString(),
    accounts: (operation) =>
      new URL(`/v1/accounts:${operation}`, override ?? IDENTITYTOOLKIT_ORIGIN).toString(),
    x509: serverEnv.firebaseX509UrlOverride ?? X509_URL,
  }
}

async function fetchCerts(): Promise<CertFetchResult> {
  const response = await fetch(firebaseEndpoints().x509, {
    cache: 'no-store',
    signal: AbortSignal.timeout(KEYS_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`x509 list: HTTP ${response.status}`)
  const json: unknown = await response.json()
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('x509 list: unexpected body')
  }
  const certs: Record<string, string> = {}
  for (const [kid, pem] of Object.entries(json)) {
    if (typeof pem === 'string') certs[kid] = pem
  }
  const match = /(?:^|[,\s])max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '')
  const maxAge = match?.[1] === undefined ? undefined : Number(match[1])
  return { certs, maxAgeSec: maxAge }
}

// 公開鍵の一覧の保持は module scope に置いてよい(Supabase の client ではなく、秘密を含まない公開値)
let keyStore: KeyStore | null = null
function getKeyStore(): KeyStore {
  keyStore ??= createKeyStore({ fetchCerts })
  return keyStore
}

/** この project 向けの ID トークンを検証する。署名・iss・aud・期限・sub・auth_time を確かめる。 */
export function verifyFirebaseIdToken(token: string, maxAuthAgeSec?: number): Promise<VerifyResult> {
  return verifyIdToken(token, {
    projectId: clientEnv.firebaseProjectId,
    nowSec: Math.floor(Date.now() / 1000),
    getKey: (kid) => getKeyStore().getKey(kid),
    ...(maxAuthAgeSec === undefined ? {} : { maxAuthAgeSec }),
  })
}

/**
 * 本人の ID トークンで Firebase のアカウントを消す(`accounts:delete`・Web API key のみ・管理の鍵なし)。
 * 成功(HTTP 2xx で、エラーを含まない JSON の本体)と `USER_NOT_FOUND`(既に消えている)だけが true。
 * そのほかの HTTP の非成功・通信の失敗・時間切れ・応答の解釈の失敗は false。判定は account-core の `isAccountDeleted`。
 */
export async function deleteFirebaseAccount(idToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${firebaseEndpoints().accounts('delete')}?key=${encodeURIComponent(clientEnv.firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
        signal: AbortSignal.timeout(ACCOUNT_DELETE_TIMEOUT_MS),
      },
    )
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return isAccountDeleted(response.status, body)
  } catch {
    return false
  }
}

/**
 * 更新用の鍵で ID トークンを取り直す(Web API key のみ・管理の鍵なし)。
 * `status` が null なら通信の失敗か時間切れ。分類(失効か一時の失敗か)は core の `classifyRefreshResponse`。
 */
export async function fetchRefresh(refreshToken: string): Promise<{ status: number | null; body: unknown }> {
  try {
    const response = await fetch(
      `${firebaseEndpoints().token}?key=${encodeURIComponent(clientEnv.firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
        cache: 'no-store',
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      },
    )
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return { status: response.status, body }
  } catch {
    return { status: null, body: null }
  }
}
