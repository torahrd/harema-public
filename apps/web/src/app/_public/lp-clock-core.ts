/** 端末ローカル時刻の 24 時間表記 `HH:mm:ss`。ロケール差に賭けず自前でゼロ埋めする。 */
export function formatClock(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/** 表示する文。時刻が null(SSR・初回描画)なら `Tokyo` だけ。 */
export function clockLabel(clock: string | null): string {
  return clock === null ? 'Tokyo' : `Tokyo · ${clock}`
}
