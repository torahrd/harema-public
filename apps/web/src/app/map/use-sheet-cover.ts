'use client'

import { useEffect, type RefObject } from 'react'
import { isDevBuild } from '@/env/client'
import { sheetFollowInset } from './sheet-cover'

/**
 * 保存シートが開いている間、地図の器の下端をシートの上端まで縮める。
 * Google Maps の帰属表示(ロゴと著作権表記)を隠さないため
 * (https://developers.google.com/maps/documentation/javascript/policies)。
 * 毎フレーム測るので state にせず、器の style.bottom を DOM に直接書く(MapView を描き直さない)。
 */

/** 根からの見た目の位置(transform を含む)。止まっているときは offsetTop と同じ値。 */
function measureSheetTop(dialog: HTMLElement, root: HTMLElement): number {
  return dialog.getBoundingClientRect().top - root.getBoundingClientRect().top
}

export function useSheetCover(
  active: boolean,
  mapBoxRef: RefObject<HTMLElement | null>,
  sheetWrapperRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return
    const mapBox = mapBoxRef.current
    const wrapper = sheetWrapperRef.current
    const root = mapBox?.parentElement
    if (!mapBox || !wrapper || !root) return
    const dialog = wrapper.querySelector<HTMLElement>(':scope > [role="dialog"]')
    if (!dialog) {
      if (isDevBuild) {
        console.warn('useSheetCover: シートの dialog が見つからないため、地図を縮めません')
      }
      return
    }

    let frame: number | null = null
    let looping = false
    let previousTop = Number.NaN

    // animating = 動きの途中のフレーム。下へ動く間は全画面にする(理由は sheetFollowInset)。
    const measure = (animating = false) => {
      const sheetTop = measureSheetTop(dialog, root)
      const inset = sheetFollowInset(
        sheetTop,
        root.getBoundingClientRect().height,
        previousTop,
        animating,
      )
      previousTop = sheetTop
      mapBox.style.bottom = `${inset}px`
    }

    // 1 フレームに 1 回だけ測る。
    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        measure(dialog.getAnimations().length > 0)
      })
    }

    // 動きの間は毎フレーム測り、動きが終わったフレームで最後に 1 回測って止める。
    const tick = () => {
      frame = null
      const animating = dialog.getAnimations().length > 0
      measure(animating)
      if (animating) {
        frame = window.requestAnimationFrame(tick)
      } else {
        looping = false
      }
    }
    const startLoop = () => {
      if (looping) return
      looping = true
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(tick)
    }

    measure()
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(dialog)
    resizeObserver.observe(root)
    const mutationObserver = new MutationObserver(startLoop)
    mutationObserver.observe(dialog, { attributes: true, attributeFilter: ['style'] })
    // 開く動き(入場の transition)は style 変化の直後に始まる。初回も追従に入れる。
    startLoop()

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      mapBox.style.bottom = '0px'
    }
  }, [active, mapBoxRef, sheetWrapperRef])
}
