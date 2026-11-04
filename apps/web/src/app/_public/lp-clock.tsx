'use client'

import { useEffect, useState } from 'react'
import { clockLabel, formatClock } from './lp-clock-core'

/**
 * LP 段 1 の見出しの真上の時刻の行。場所は `Tokyo` 固定、時刻は端末ローカル。
 * サーバとクライアントで値が必ず食い違うので、時刻はマウント後にだけ載せる(SSR / 初回描画は
 * `Tokyo` のみ)。unmount でタイマーも止まる。
 * 時刻は飾りなので aria-live は付けず、毎秒の読み上げを避けるため aria-hidden にする
 * (「Tokyo」だけの行を読ませても情報にならない)。
 */
export function LpClock() {
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
    // data-lp-extra: 毎秒変わる文なので、lp-check の構造と文言(T1)の列から外す(折れの検査 T3 には残る)。
    <p className="lp-clk" aria-hidden="true" data-lp-extra="clock">
      {clockLabel(clock)}
    </p>
  )
}
