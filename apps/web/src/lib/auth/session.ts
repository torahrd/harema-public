import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { cookies } from 'next/headers'
import { clientEnv } from '@/env/client'
import { serverEnv } from '@/env/server'
import {
  SESSION_COOKIE_NAME,
  classifySessionValidity,
  clearedCookieAttributes,
  openSession,
  parseSessionKeys,
  resolveTokenUser,
  resolveVerifiedUser,
  type SessionKey,
  type SessionValidity,
  type TokenUserResult,
  type VerifiedUser,
} from './core'
import { verifyFirebaseIdToken } from './firebase'

/**
 * サーバ(Server Component・Server Action・Route Handler)から見たログインの口。
 *
 * - `getVerifiedUser()`: 認可に使う唯一の本人の判定。署名・iss・aud・期限を検証した ID トークンの
 *   `sub` と、DB の `session_is_valid()`(失効と 30 日)が真のときだけ利用者を返す。
 *   cookie の中身や `createUserSupabase()` の client を、この判定を経ずに認可へ使わない。
 * - `createUserSupabase()`: 要求ごとに作る Supabase client(`accessToken` に cookie の ID トークン)。
 *   module scope に置かない。RLS と関数の判定は DB が ID トークンで行う。
 */

const DB_CHECK_TIMEOUT_MS = 5_000

export function isSecureCookie(): boolean {
  return new URL(clientEnv.appUrl).protocol === 'https:'
}

let sessionKeys: SessionKey[] | null = null
/** `SESSION_ENCRYPTION_KEYS` の解析結果(値の検証は env/server.ts が起動時に済ませている)。 */
export function getSessionKeys(): SessionKey[] {
  sessionKeys ??= parseSessionKeys(serverEnv.sessionEncryptionKeys)
  return sessionKeys
}

function newSupabaseClient(idToken: string | null): SupabaseClient<Database> {
  return createClient<Database>(clientEnv.supabaseUrl, clientEnv.supabasePublishableKey, {
    // accessToken を渡すと supabase-js の auth 機能は使えなくなる(使うと例外)。この形が狙い
    accessToken: async () => idToken,
  })
}

async function checkSessionValidity(idToken: string): Promise<SessionValidity> {
  const result = await newSupabaseClient(idToken)
    .rpc('session_is_valid')
    .abortSignal(AbortSignal.timeout(DB_CHECK_TIMEOUT_MS))
  return classifySessionValidity({
    data: result.data,
    status: result.status,
    hadError: result.error !== null,
  })
}

/**
 * 署名を検証し DB の判定まで真の利用者を返す。偽のとき cookie を消す(Server Component からは
 * cookie を書けないので、書けないときは消さずに未ログインを返す。次の Action か proxy で消える)。
 * 偽・判定できないときは null。呼び出し側は null のとき secret key の操作と Place Details の呼び出しに進まない。
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const store = await cookies()
  return await resolveVerifiedUser(store.get(SESSION_COOKIE_NAME)?.value, {
    keys: getSessionKeys(),
    nowSec: Math.floor(Date.now() / 1000),
    verifyIdToken: (token) => verifyFirebaseIdToken(token),
    checkSessionValidity,
    clearCookie: () => {
      try {
        store.set(SESSION_COOKIE_NAME, '', clearedCookieAttributes(isSecureCookie()))
      } catch {
        // Server Component からは cookie を書けない(Next.js の制約)
      }
    },
  })
}

/**
 * 渡された ID トークン(mobile の受け口の `Authorization: Bearer`)から、`getVerifiedUser()` と同じ核
 * (`resolveTokenUser`)で利用者を返す。cookie を読まない・書かない。署名・iss・aud・期限と DB の `session_is_valid()` が
 * 真のときだけ `ok: true`。失敗の理由は呼び出し側(受け口の包み)が 401 / 503 に分ける。
 */
export async function getVerifiedUserFromToken(idToken: string): Promise<TokenUserResult> {
  return await resolveTokenUser(idToken, {
    verifyIdToken: (token) => verifyFirebaseIdToken(token),
    checkSessionValidity,
  })
}

/**
 * 要求ごとの Supabase client。cookie が開ければその ID トークンを `accessToken` に使い、
 * 開けなければ anon の公開鍵のまま(DB が何も返さない)。ID トークンの検証はしない —
 * 認可の判定には `getVerifiedUser()` を使うこと。
 */
export async function createUserSupabase(): Promise<SupabaseClient<Database>> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE_NAME)?.value
  const opened = raw ? openSession(raw, getSessionKeys(), Math.floor(Date.now() / 1000)) : null
  return newSupabaseClient(opened?.ok ? opened.session.it : null)
}

/**
 * 渡された ID トークンを `accessToken` にした、要求ごとの Supabase client。退会の `begin_withdrawal()`・
 * `finish_withdrawal()` が、再認証で得た ID トークン(cookie のトークンは 6 分以上前のことがある)で呼ぶために使う。
 * ID トークンの検証はしない — 呼ぶ側が先に署名・iss・aud・auth_time・sub を確かめる。module scope に置かない。
 */
export function createTokenSupabase(idToken: string): SupabaseClient<Database> {
  return newSupabaseClient(idToken)
}

/**
 * cookie が開けるときの ID トークン(開けない・無いときは null)。署名の検証も DB の判定もしない —
 * 本人の `accounts:delete` のような、ID トークンそのものを外へ渡す処理が `getVerifiedUser()` の
 * 後に使う。認可には使わない。
 */
export async function getSessionIdToken(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE_NAME)?.value
  const opened = raw ? openSession(raw, getSessionKeys(), Math.floor(Date.now() / 1000)) : null
  return opened?.ok ? opened.session.it : null
}

/** Server Action からセッション cookie を消す(Route Handler は応答の cookie に自分で書く)。 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE_NAME, '', clearedCookieAttributes(isSecureCookie()))
}
