'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 改定のお知らせの枠(LP の更新情報の、その改定の 1 件の文を入れる)。高さは 176px 固定で、中身が多い時は中で上下に動かす
 * (変更が少ない時も多い時も同じ大きさに見せる)。値は承認された図(2026-11-25 22:56 JST・harema#152 コメント 7164529219)のとおり。
 *
 * 動かせる印: 標準のスクロールバーは隠し(globals.css の .qs-nbx-in)、図の細い線(幅 3px・右 3px・角 2px)を重ねる。
 * 印は動く中身の外(器 .qs-nbx の中)にあり、中身と一緒に流れない。位置と長さは、枠の中の位置と見える割合から決める
 * (上下 6px の余白の中)。中身が枠に収まる時は出さない。計算は DOM を直接書く(描画の中で時計や測りを読まない)。
 */
const TRACK_PAD = 6
const MIN_THUMB = 16

export function NoticeNewsBox({ title, children }: { title: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = box.current
    const mark = thumb.current
    if (el === null || mark === null) return
    const update = () => {
      const { scrollHeight, clientHeight, scrollTop } = el
      if (scrollHeight <= clientHeight) {
        mark.hidden = true
        return
      }
      const track = clientHeight - TRACK_PAD * 2
      const height = Math.max(MIN_THUMB, (track * clientHeight) / scrollHeight)
      const ratio = scrollTop / (scrollHeight - clientHeight)
      mark.style.height = `${height}px`
      mark.style.top = `${TRACK_PAD + (track - height) * Math.min(1, Math.max(0, ratio))}px`
      mark.hidden = false
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  return (
    <div className="qs-nbx">
      {/* キーボードでも動かせる(tabIndex 0・矢印・PageDown)。名前は件の題。 */}
      <div ref={box} className="qs-nbx-in" role="region" aria-label={title} tabIndex={0}>
        {children}
      </div>
      <div className="qs-nbx-track" aria-hidden="true">
        <span ref={thumb} className="qs-nbx-thumb" hidden />
      </div>
    </div>
  )
}
