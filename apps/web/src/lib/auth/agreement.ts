import 'server-only'

import { recordCurrentAgreement } from './consent-notice'
import { createTokenSupabase } from './session'

/**
 * ログインの記録。`POST /auth/session` の受付が、ID トークンの検証と cookie の値の作成が済んだ後に呼ぶ。
 *
 * - 記録する番号は DB の `agree_current()` が決める(引数なし。画面や端末は番号も日時も送らない。時刻は DB の now())。
 *   `agreed` はログインの画面を経たことの目印として、`true` かだけ見る。
 * - 渡す ID トークンは、受付が署名・iss・aud・期限・auth_time を検証したもの。書く ID は DB の関数がそのトークンの `sub` から決める。secret key は使わない。
 * - 登録の前のログイン(`user_agreements` の行がまだ無い)は、DB が同意前の行に記録し、登録で `user_agreements` へ写す。
 * - 戻りは `recorded`・`already`・`skipped`(どちらの行も無い・削除中の印)・`failed`。投げない。呼び手は結果を捨てる(記録の失敗はログインを止めない)。
 * - 待ちの打ち切りは受付(`acceptLogin`)と `recordCurrentAgreement`(5 秒)が持つ。
 */
export type RecordAgreementResult = 'recorded' | 'already' | 'skipped' | 'failed'

export async function recordAgreement(idToken: string): Promise<RecordAgreementResult> {
  return recordCurrentAgreement(createTokenSupabase(idToken))
}
