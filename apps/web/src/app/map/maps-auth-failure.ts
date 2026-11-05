// Google Maps の鍵の拒否(InvalidKey など)を覚える小さな store。react は import しない。
//
// - vis.gl/react-google-maps 1.9.0 / 1.10.2 は `useApiLoadingStatus` の `AUTH_FAILURE` を立てない。
//   鍵の拒否は Google の公式の口 `window.gm_authFailure` だけで分かる。
// - `gm_authFailure` はグローバルに 1 つで、Google は 1 文書に 1 回しか呼ばない。
//   よって一度失敗したら覚え続ける(戻すのは文書の読み直しだけ)。
// - 購読を外す時は listener を外すだけで、`gm_authFailure` は消さない
//   (購読者がいない間に呼ばれても失敗を覚えるため)。

export type MapsAuthFailureTarget = { gm_authFailure?: () => void }

export type MapsAuthFailureStore = {
  getSnapshot: () => boolean
  subscribe: (target: MapsAuthFailureTarget, listener: () => void) => () => void
}

export function createMapsAuthFailureStore(): MapsAuthFailureStore {
  let failed = false
  const listeners = new Set<() => void>()

  const report = () => {
    if (failed) return
    failed = true
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => failed,
    subscribe(target, listener) {
      target.gm_authFailure = report
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
