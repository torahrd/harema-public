'use client'

import { useSyncExternalStore } from 'react'
import { createMapsAuthFailureStore } from './maps-auth-failure'

declare global {
  interface Window {
    /** Google Maps JS が鍵を拒否した時に呼ぶ(1 文書に 1 回)。 */
    gm_authFailure?: () => void
  }
}

const store = createMapsAuthFailureStore()
// hook の中で作ると、描画のたびに購読が付け直されるので module の階層に置く。
const subscribe = (listener: () => void) => store.subscribe(window, listener)
const getServerSnapshot = () => false

/** Maps JS が鍵を拒否したか。サーバの snapshot は常に false。 */
export function useMapsAuthFailure(): boolean {
  return useSyncExternalStore(subscribe, store.getSnapshot, getServerSnapshot)
}
