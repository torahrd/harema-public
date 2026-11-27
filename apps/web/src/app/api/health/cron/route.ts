import 'server-only'

import { createCronHealthReader } from '@/lib/cron/cron-health'
import { readCronHealth } from '@/lib/supabase/admin'

/**
 * 定期実行の成否の確かめ用の口(harema#168)。Google Cloud の Uptime check が 15 分ごとに叩き、
 * 2xx でなければ所有者にメールが届く。認証なしの公開の口なので、
 * - 返すのは状態コードと 3 つの ok / ng だけ(時刻・件数・エラーの中身・識別子は出さない)。
 * - 外から来た値は何も読まない(関数にも控えにも渡さない)。GET は引数を取らない。
 * - ログは出さない。
 * DB の読み取りは 60 秒の控え(結果だけ・module scope)で 1 つの実行体につき 60 秒に 1 回まで。
 */
export const dynamic = 'force-dynamic'

const readReport = createCronHealthReader({ read: readCronHealth, now: Date.now })

export async function GET(): Promise<Response> {
  const { status, body } = await readReport()
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
