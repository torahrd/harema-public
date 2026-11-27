import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@harema/supabase/types'
import { CLOSED_AGREEMENT_STATE, parseAgreementState, type AgreementState } from '@harema/shared/validations'

/**
 * 「改定のお知らせ」(地図を開いた時の同意の取り直し)と、リストの門の判定・記録。
 *
 * - お知らせを出すか・今のバージョンに同意済みか・お知らせの文・リストを開いてよいかは、DB の `agreement_state()` が 1 行で決める。
 *   時刻は DB の now() で、端末の時計に頼らない。本人の行だけを見る(書く・読む ID は DB が検証済みの sub から決める)。
 *   文(日付は `{date}`)は DB の改定の行に持ち、画面は辞書から文を持たない。
 * - 判定の失敗(通信・拒否・行が無い・形の違い・お知らせが要るのに文が無い)は「出さない・開かない」に倒す
 *   (`CLOSED_AGREEMENT_STATE`: 同意は未確認・お知らせなし・リストは閉じる)。判定が壊れて地図を使えなくしない。
 * - 記録は `agree_current()` を引数なしで 1 回呼ぶだけ(番号も日時も DB が決める。`agreement_state` を先に読まない)。
 *   同じ番号の 2 回目は何も足さず成功(`already`)とみなす。登録の前のログインは同意前の行に記録され、これも `recorded` / `already` で返る。
 *   `unregistered`(どちらの行も無い・削除中の印)は `skipped`(記録の相手が無く、何も書いていない)、ほかの値・エラーは `failed`。
 * - どちらも投げない。呼ぶ側は要求ごとに作った client(`createUserSupabase()`)を渡す。
 */
type Client = Pick<SupabaseClient<Database>, 'rpc'>

const ABORT_AFTER_MS = 5_000

/** 同意の状態(同意済みか・お知らせの文・リストを開いてよいか)。失敗は `CLOSED_AGREEMENT_STATE`。投げない。 */
export async function readAgreementState(client: Client): Promise<AgreementState> {
  try {
    const { data, error } = await client.rpc('agreement_state').abortSignal(AbortSignal.timeout(ABORT_AFTER_MS))
    if (error !== null) return CLOSED_AGREEMENT_STATE
    return parseAgreementState(data)
  } catch {
    return CLOSED_AGREEMENT_STATE
  }
}

/** 同意の取り直しを求めるか。見ていないお知らせ付きの改定が適用済みで、出せる文が在る時だけ true。失敗は false。 */
export async function isConsentNoticeDue(client: Client): Promise<boolean> {
  return (await readAgreementState(client)).notice !== null
}

/**
 * 本人が今のバージョンに同意済みか(DB の agreed)。言語の cookie を書いてよい人かの判定に使う(setLocale)。
 * 失敗(通信・拒否・行が無い)は false(書かない側に倒す)。投げない。
 */
export async function hasAgreedToCurrent(client: Client): Promise<boolean> {
  return (await readAgreementState(client)).agreed
}

export type RecordCurrentResult = 'recorded' | 'already' | 'skipped' | 'failed'

/** 今のバージョンに同意したことを記録する。 */
export async function recordCurrentAgreement(client: Client): Promise<RecordCurrentResult> {
  try {
    const { data, error } = await client.rpc('agree_current').abortSignal(AbortSignal.timeout(ABORT_AFTER_MS))
    if (error !== null) return 'failed'
    if (data === 'recorded' || data === 'already') return data
    return data === 'unregistered' ? 'skipped' : 'failed'
  } catch {
    return 'failed'
  }
}
