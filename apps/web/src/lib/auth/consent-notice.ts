import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'

/**
 * 「改定のお知らせ」(地図を開いた時の同意の取り直し)の判定と記録。
 *
 * - お知らせを出すか(notice_due)も、今のバージョンに同意済みか(agreed)も、DB の `current_agreement()` が決める。
 *   時刻は DB の now() で、端末の時計に頼らない。本人の行だけを見る(書く・読む ID は DB が検証済みの sub から決める)。
 * - 判定の失敗(通信・拒否・行が無い)は「出さない」に倒す。判定が壊れて地図を使えなくしない。
 * - 記録は `record_agreement()` を引数なしで 1 回呼ぶだけ(番号も日時も DB が決める。`current_agreement` を先に読まない)。
 *   同じ番号の 2 回目は何も足さず成功(`already`)とみなす。登録の前のログインは同意前の行に記録され、これも `recorded` / `already` で返る。
 *   `unregistered`(どちらの行も無い・削除中の印)は `skipped`(記録の相手が無く、何も書いていない)、ほかの値・エラーは `failed`。
 * - どちらも投げない。呼ぶ側は要求ごとに作った client(`createUserSupabase()`)を渡す。
 */
type Client = Pick<SupabaseClient<Database>, 'rpc'>

const ABORT_AFTER_MS = 5_000

type CurrentRow = { agreed: boolean; notice_due: boolean }

async function readCurrent(client: Client): Promise<CurrentRow | null> {
  const { data, error } = await client.rpc('current_agreement').abortSignal(AbortSignal.timeout(ABORT_AFTER_MS))
  if (error !== null) return null
  const row = Array.isArray(data) ? data[0] : undefined
  if (row === undefined || typeof row.agreed !== 'boolean' || typeof row.notice_due !== 'boolean') {
    return null
  }
  return row
}

/** 同意の取り直しを求めるか。見ていないお知らせ付きの改定が適用済みの時だけ true(DB の notice_due)。失敗は false。 */
export async function isConsentNoticeDue(client: Client): Promise<boolean> {
  try {
    const row = await readCurrent(client)
    return row !== null && row.notice_due === true
  } catch {
    return false
  }
}

/**
 * 本人が今のバージョンに同意済みか(DB の agreed)。言語の cookie を書いてよい人かの判定に使う(setLocale)。
 * 失敗(通信・拒否・行が無い)は false(書かない側に倒す)。投げない。
 */
export async function hasAgreedToCurrent(client: Client): Promise<boolean> {
  try {
    const row = await readCurrent(client)
    return row !== null && row.agreed === true
  } catch {
    return false
  }
}

export type RecordCurrentResult = 'recorded' | 'already' | 'skipped' | 'failed'

/** 今のバージョンに同意したことを記録する。 */
export async function recordCurrentAgreement(client: Client): Promise<RecordCurrentResult> {
  try {
    const { data, error } = await client.rpc('record_agreement').abortSignal(AbortSignal.timeout(ABORT_AFTER_MS))
    if (error !== null) return 'failed'
    if (data === 'recorded' || data === 'already') return data
    return data === 'unregistered' ? 'skipped' : 'failed'
  } catch {
    return 'failed'
  }
}
