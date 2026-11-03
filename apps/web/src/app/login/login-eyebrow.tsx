'use client'

import { useEffect, useState } from 'react'

/** 端末ローカル時刻の 24 時間表記 `HH:mm:ss`。ロケール差に賭けず自前でゼロ埋めする。 */
function formatClock(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/**
 * `/login` の eyebrow。場所は `Tokyo` 固定(spec §7 の既定エリア = 東京駅)、時刻は端末ローカル。
 * サーバとクライアントで値が必ず食い違うので、時刻はマウント後にだけ載せる(SSR / 初回描画は
 * `Tokyo` のみ)。`/login` を離れると unmount され、タイマーも止まる。
 */
export function LoginEyebrow() {
  const [clock, setClock] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => setClock(formatClock(new Date()))
    sync()
    const intervalId = window.setInterval(sync, 1000)
    // iOS Safari は背面のタイマーを絞るため、前面復帰の時点で読みを合わせ直す。
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    // Quiet Signal の meta + mono(罫の飾りなし・大文字化なし = FREEZE ① の「Tokyo · 09:41:07」)。
    <p className="qs-eb">
      {clock === null ? 'Tokyo' : `Tokyo · ${clock}`}
    </p>
  )
}
