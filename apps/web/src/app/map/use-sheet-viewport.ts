'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * S1 を visual viewport に追従させる。ソフトキーボードが出ると visual viewport だけが縮み、
 * layout viewport は変わらないので、`bottom: 0` のシートはキーボードの裏へ回り込む(iOS Safari)。
 * layout.tsx の viewport は全ページに効くため触れない(WP-08 計画 L-21)—— シートの内側で解く。
 *
 * 端末ごとの「残り px」を決め打ちせず、差分だけを見る:基準を凍結していない間は「キーボードが
 * 無いときの可視下端」を実測し続け、凍結中はその値を保って、いまの可視下端との差を返す。
 * 上限の 85svh は据え置いたまま、実効の高さだけが視野に合わせて縮む(svh = ツールバー表示側)。
 *
 * 凍結するのは入力中だけではない。キーボードが沈んでいる最中にも resize は何度も来るので、
 * 閉じるのを待っている間も凍結しないと、下がりきる前に基準が取り直されて差が 0 に潰れる。
 */

type Metrics = {
  /** visual viewport の高さ。シートの実効上限になる。 */
  height: number
  /** layout viewport 座標での可視領域の下端。 */
  visibleBottom: number
  /** キーボードが無いときの可視下端(基準)。 */
  restBottom: number
}

export type SheetViewport = {
  /** シートに与える max-height の CSS 値。 */
  maxHeight: string
  /** 可視領域の下端が layout viewport の下端から浮いている量(px)。キーボードの高さ。 */
  keyboardInset: number
}

/**
 * @param holdBaseline キーボードが無いときの可視下端を取り直さない期間(入力中と、キーボードが
 *   下がりきるのを待っている間)。
 */
export function useSheetViewport(holdBaseline: boolean): SheetViewport {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const holdBaselineRef = useRef(holdBaseline)

  useEffect(() => {
    holdBaselineRef.current = holdBaseline
  }, [holdBaseline])

  useEffect(() => {
    const viewport = window.visualViewport
    // visualViewport を持たない環境では追従しない(その場合キーボードで縮む視野も無い)。
    if (!viewport) return

    const update = () => {
      const visibleBottom = viewport.offsetTop + viewport.height
      setMetrics((previous) => ({
        height: viewport.height,
        visibleBottom,
        // 凍結中に基準を取り直すと、キーボードの高さがそのまま 0 に潰れる。
        restBottom:
          holdBaselineRef.current && previous
            ? previous.restBottom
            : visibleBottom,
      }))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  if (!metrics) {
    return { maxHeight: '85svh', keyboardInset: 0 }
  }
  return {
    maxHeight: `min(85svh, ${Math.round(metrics.height)}px)`,
    keyboardInset: Math.max(
      0,
      Math.round(metrics.restBottom - metrics.visibleBottom),
    ),
  }
}
