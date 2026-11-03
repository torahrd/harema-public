import 'server-only'

import type { DbResult, ProfileState } from './account-core'
import { createTokenSupabase, createUserSupabase } from './session'

/**
 * アカウント操作が DB に問う口(要求ごとの client・cookie の ID トークン)。
 * 戻りは分類(account-core の `classifyDbFailure`)に要る形にそろえる。例外は通信の失敗(status 0)として返す。
 * 呼び出し側は、先に `getVerifiedUser()` が真であることを確かめてから使う。
 */

const DB_TIMEOUT_MS = 5_000

function toDbResult(result: { error: { code?: string; message?: string } | null; status: number }): DbResult {
  return {
    error: result.error === null ? null : { code: result.error.code, message: result.error.message },
    status: result.status,
  }
}

/** RPC `revoke_this_session()`: そのログインだけを止める失効の行を書く。 */
export async function revokeThisSession(): Promise<DbResult> {
  try {
    const supabase = await createUserSupabase()
    return toDbResult(await supabase.rpc('revoke_this_session').abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS)))
  } catch {
    return { error: { message: 'call threw' }, status: 0 }
  }
}

/** 退会の 2 つの RPC を呼ぶ client。`idToken` があればそのトークン(再認証のもの)、無ければ cookie のトークン。 */
async function withdrawalClient(idToken: string | null) {
  return idToken === null ? await createUserSupabase() : createTokenSupabase(idToken)
}

/**
 * RPC `begin_withdrawal()`: 退会の印と利用者単位の失効を 1 トランザクションで書く(戻りは `marked` /
 * `already_marked` のどちらも成功)。退会は再認証のトークン、Onboarding の中止は `null`(cookie のトークン)。
 */
export async function beginWithdrawal(idToken: string | null): Promise<DbResult> {
  try {
    const supabase = await withdrawalClient(idToken)
    return toDbResult(await supabase.rpc('begin_withdrawal').abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS)))
  } catch {
    return { error: { message: 'call threw' }, status: 0 }
  }
}

/**
 * RPC `finish_withdrawal()`: 印のある sub の 4 つの表・同意前の行・ログイン単位の失効を消す(印の後の
 * 本人のトークンを受ける)。トークンの渡し方は `beginWithdrawal` と同じ。
 */
export async function finishWithdrawal(idToken: string | null): Promise<DbResult> {
  try {
    const supabase = await withdrawalClient(idToken)
    return toDbResult(await supabase.rpc('finish_withdrawal').abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS)))
  } catch {
    return { error: { message: 'call threw' }, status: 0 }
  }
}

/** RPC `complete_onboarding`: profiles と user_agreements を 1 トランザクションで書き、同意前の行を消す。 */
export async function callCompleteOnboarding(username: string): Promise<DbResult> {
  try {
    const supabase = await createUserSupabase()
    return toDbResult(
      await supabase
        .rpc('complete_onboarding', { p_username: username })
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS)),
    )
  } catch {
    return { error: { message: 'call threw' }, status: 0 }
  }
}

/** 本人の profiles の行の有無。問い合わせが失敗したら `unknown`(「行が無い」側へ進めない)。 */
export async function findProfileState(userId: string): Promise<ProfileState> {
  try {
    const supabase = await createUserSupabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
      .maybeSingle()
    if (error) return 'unknown'
    return data ? 'exists' : 'absent'
  } catch {
    return 'unknown'
  }
}
