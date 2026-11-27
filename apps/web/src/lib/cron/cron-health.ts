/**
 * 定期実行の成否の確かめ用の口(`GET /api/health/cron`)の中身。
 * `server-only` も `@/` の import も持たない(node のテストから直接読む。`cron-auth.ts` と同じ置き方)。
 *
 * 口は認証なしで呼ばれるので、返すのは状態コードと、決めた 3 つの名前の ok / ng だけ。
 * 時刻・件数・エラーの中身・識別子は出さない。
 */

export type CronHealthLabel = 'ok' | 'ng'

export type CronHealthBody =
  | { refreshPlaces: CronHealthLabel; cleanupOgp: CronHealthLabel; purgeCoords: CronHealthLabel }
  | { error: 'unavailable' }

export type CronHealthReport = { status: 200 | 503; body: CronHealthBody }

const UNAVAILABLE: CronHealthReport = { status: 503, body: { error: 'unavailable' } }

function label(value: unknown): CronHealthLabel {
  return value === true ? 'ok' : 'ng'
}

/**
 * DB の関数 `cron_health()` の最初の行を、応答の形にする。
 * 3 つの列が `=== true` のときだけ ok。false・無い・型が違う・行が無いは ng(1 つでも ng なら 503)。
 * 行の余計な列は本文に出さない。
 */
export function toCronHealthReport(row: unknown): CronHealthReport {
  const record =
    typeof row === 'object' && row !== null && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : {}
  const body = {
    refreshPlaces: label(record.refresh_places),
    cleanupOgp: label(record.cleanup_ogp),
    purgeCoords: label(record.purge_coords),
  }
  const allOk =
    body.refreshPlaces === 'ok' && body.cleanupOgp === 'ok' && body.purgeCoords === 'ok'
  return { status: allOk ? 200 : 503, body }
}

export type CronHealthDeps = {
  read: () => Promise<unknown>
  now: () => number
}

/**
 * 結果を `ttlMs`(既定 60 秒)の間返す控え。DB の読み取りは 1 つの実行体につき 60 秒に 1 回まで。
 * 走っている読み取りがあれば、同時の呼び出しはそれを分け合う。`read` が投げたら 503 `unavailable`
 * (エラーの中身は出さない)で、これも控える。要求の値は一切受けない。
 */
export function createCronHealthReader(
  deps: CronHealthDeps,
  ttlMs = 60_000,
): () => Promise<CronHealthReport> {
  let cached: { report: CronHealthReport; expiresAt: number } | null = null
  let inflight: Promise<CronHealthReport> | null = null

  return function readReport(): Promise<CronHealthReport> {
    if (cached !== null && deps.now() < cached.expiresAt) return Promise.resolve(cached.report)
    if (inflight !== null) return inflight
    inflight = (async () => {
      let report: CronHealthReport
      try {
        report = toCronHealthReport(await deps.read())
      } catch {
        report = UNAVAILABLE
      }
      cached = { report, expiresAt: deps.now() + ttlMs }
      return report
    })().finally(() => {
      inflight = null
    })
    return inflight
  }
}
