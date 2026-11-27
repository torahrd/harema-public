import { connection } from 'next/server'

/**
 * この要求のサーバの時刻(`Date.now()` の値)。公開ページ(/privacy・/news・/ と英語のページ)が、適用の日時の前後で本文・文を切り替えるために
 * 呼ぶ(`legal-switch.ts` の `privacyDocument`・`news.ts` の `newsText` に渡す)。
 *
 * `await connection()` を先に呼ぶので、頁は静的に作られず要求ごとに描かれ、適用の日時の 0 時ちょうどにデプロイなしで切り替わる
 * (ISR の `revalidate` は 0 時の後の最初の要求まで切り替わらないので使わない)。端末の時計に頼らない。
 * 時計を読むのはここだけ(頁と本体は、渡された値を使う。描画の中で `Date.now()` を呼ぶと react-hooks/purity が止める)。
 */
export async function requestTime(): Promise<number> {
  await connection()
  return Date.now()
}
