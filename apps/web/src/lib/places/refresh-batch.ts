import type { ResolvedPlace } from './details'

/** 定期の取り直しの 1 回ぶん。呼び出しは依存で受け、DB・Google・時計に触れない(テストでは偽を渡す)。 */
export type PlaceRefreshDeps = {
  /** 今日の取り直しの対象(google_place_id)。今日は既に返したなら空。 */
  claim: () => Promise<string[]>
  /** 実在すれば座標つき、無い・失敗なら null(`fetchPlaceLocation`)。 */
  fetchLocation: (googlePlaceId: string) => Promise<ResolvedPlace | null>
  /** 検証済みの座標で places を更新する(`upsertVerifiedPlace`)。 */
  upsert: (place: ResolvedPlace) => Promise<unknown>
}

export type PlaceRefreshResult = {
  picked: number
  refreshed: number
  missing: number
  failed: number
}

/**
 * 対象を同時に `concurrency` 件まで取り直す。fetch が null の店は upsert しない(`missing`)。
 * 1 件の失敗(fetch・upsert の例外)で他を止めない(`failed`)。`claim` の失敗は呼び出し側へ上げる。
 * 戻りは件数だけ(識別子・座標を返さない)。
 */
export async function runPlaceRefreshBatch(
  deps: PlaceRefreshDeps,
  options: { concurrency: number },
): Promise<PlaceRefreshResult> {
  const ids = await deps.claim()
  const result: PlaceRefreshResult = { picked: ids.length, refreshed: 0, missing: 0, failed: 0 }
  let next = 0

  async function worker(): Promise<void> {
    while (next < ids.length) {
      const id = ids[next]
      next += 1
      if (id === undefined) return
      try {
        const resolved = await deps.fetchLocation(id)
        if (resolved === null) {
          result.missing += 1
          continue
        }
        await deps.upsert(resolved)
        result.refreshed += 1
      } catch {
        result.failed += 1
      }
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency, ids.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return result
}
