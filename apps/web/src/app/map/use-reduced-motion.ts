'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

// サーバ描画では設定を知らないので false(動かす側)に倒す。
function getServerSnapshot(): boolean {
  return false
}

/** OS の「動きを減らす」設定。変わったら再描画する。 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
