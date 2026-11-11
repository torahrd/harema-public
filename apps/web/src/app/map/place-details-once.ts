/**
 * 「詳細情報」(営業時間・電話・website)の取得を 1 マウント 1 回にするガード(React を持たない純粋な関数。mobile の `place-details-once.ts` と同じ本体)。
 *
 * - `start(load, done)` は初めての時だけ `load()` を呼んで true、2 回目からは何もせず false(折りたたみ → 再展開で取り直さない)。
 * - 部品の effect の setup で `mount()`、cleanup で `unmount()` を呼ぶ。アンマウントの後に届いた応答は捨てる。
 *   StrictMode の再生(cleanup → setup)の後は `mount()` で受け付けに戻るので、応答を捨て続けない。
 * - `load` が null を返すか投げたら `{ kind: 'failed' }`。成功は `{ kind: 'ok', value }`。
 */
export type EnterpriseOnceResult<T> = { kind: 'ok'; value: T } | { kind: 'failed' }

export type EnterpriseOnce = {
  start: <T>(load: () => Promise<T | null>, done: (result: EnterpriseOnceResult<T>) => void) => boolean
  mount: () => void
  unmount: () => void
}

async function settle<T>(load: () => Promise<T | null>): Promise<EnterpriseOnceResult<T>> {
  try {
    const value = await load()
    return value === null ? { kind: 'failed' } : { kind: 'ok', value }
  } catch {
    return { kind: 'failed' }
  }
}

export function createEnterpriseOnce(): EnterpriseOnce {
  let started = false
  let mounted = true
  return {
    start<T>(load: () => Promise<T | null>, done: (result: EnterpriseOnceResult<T>) => void) {
      if (started) return false
      started = true
      void (async () => {
        const result = await settle(load)
        if (mounted) done(result)
      })()
      return true
    },
    mount() {
      mounted = true
    },
    unmount() {
      mounted = false
    },
  }
}
