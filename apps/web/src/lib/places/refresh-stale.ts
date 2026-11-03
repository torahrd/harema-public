import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PLACE_CACHE_TTL_DAYS,
  PLACE_REFRESH_BATCH_LIMIT,
} from '@harema/shared/constants'
import type { Database } from '@harema/supabase/types'
import { fetchPlaceLocation } from './details'
import { upsertVerifiedPlace } from '@/lib/supabase/admin'

/**
 * 30 日リフレッシュ(spec §4.3)。`cached_at` が `PLACE_CACHE_TTL_DAYS` を超えた行の lat/lng を
 * 取り直す。フィールドマスクは `lib/places/details.ts` の `id,location`(Essentials)をそのまま
 * 使い、2 個目の Places クライアントを作らない。
 *
 * 書込は Place Details の戻り値を受ける admin 関数に限定する(spec §11.1-8)。
 *
 * **座標を返さない。** 呼び出し側は応答を送出した後に走らせる(`next/server` の `after()`)ので、
 * 更新はこの表示ではなく次回の表示に出る —— 座標が数日古いことは体感できないが、描画が更新の
 * 完了を待つことは体感できる。
 *
 * **1 回あたり `PLACE_REFRESH_BATCH_LIMIT` 件まで**を stale 行から**無作為に**抽出する。上限を
 * 外すと 1 回で Place Details の per-day quota cap を使い切りうる。**古い順に切らない** ——
 * 失敗した行は `upsert_place` を呼ばないので `cached_at` が更新されず、古い順では以後も先頭に
 * 居座る。恒常的に失敗する行が上限件数ぶん溜まると、健全な stale 行に順番が回らなくなる
 * (head-of-line blocking)。無作為抽出ならどの stale 行にも毎回同じ確率で順番が来る。
 *
 * **失敗を記録する列もバックオフも無い** —— `places` の列は
 * `id` / `google_place_id` / `latitude` / `longitude` / `cached_at` / `created_at` / `updated_at`
 * だけで、列の追加は凍結済み migration への追加になる。Google 側で消えた店は毎回 1 件ぶんを
 * 空振りし続けるが、上限があるので総量は有界。**失敗の記録・上限値の再導出は
 * `docs/release-runbook.md` の R5.5-#9(および決定 D8)・R7 に係属。** 定期の取り直しは
 * `app/api/cron/refresh-places`、29 日の消去は DB の毎時の処理。ここは表示時に 29 日を超えた行
 * (= 座標が消えた行)を戻す口。
 */

/** リフレッシュに要る最小の行。呼び出し側の行型はこれを含んでいればよい。 */
export type RefreshablePlace = {
  google_place_id: string
  cached_at: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function isStale(place: RefreshablePlace, now: number): boolean {
  const cachedAt = Date.parse(place.cached_at)
  // 解釈できない cached_at は「古い」に倒す(黙って新しい扱いにすると更新されなくなる)。
  if (Number.isNaN(cachedAt)) return true
  return now - cachedAt > PLACE_CACHE_TTL_DAYS * MS_PER_DAY
}

/**
 * 無作為に `limit` 件まで取る。要素ごとに乱数キーを 1 つ引いてから並べ替える形なので、
 * 比較関数の中で乱数を返す(順序が非推移的になり分布が偏る)書き方とは別物。
 */
function sampleUpTo<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items]
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((left, right) => left.key - right.key)
    .slice(0, limit)
    .map(({ item }) => item)
}

export async function refreshStalePlaces(
  supabase: SupabaseClient<Database>,
  places: readonly RefreshablePlace[],
): Promise<void> {
  const now = Date.now()
  const stale = sampleUpTo(
    places.filter((place) => isStale(place, now)),
    PLACE_REFRESH_BATCH_LIMIT,
  )
  if (stale.length === 0) return

  // 1 件の失敗が他を巻き込まないよう allSettled。
  const settled = await Promise.allSettled(
    stale.map(async (place) => {
      const resolved = await fetchPlaceLocation(place.google_place_id)
      // Google から引けない place は異常ではない(消えた店を記録する列が `places` に無い)。
      // その行は座標が null のまま残る(29 日で DB が消した行)。
      if (!resolved) return
      await upsertVerifiedPlace(resolved)
    }),
  )

  // 応答は送出済みなので、この throw は画面に影響しない(`after()` がコールバックの例外を捕捉して
  // ログに出し、再送出しない)。黙って捨てると書込の失敗が誰にも観測できなくなる。
  const reasons: unknown[] = settled.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (reasons.length > 0) {
    throw new AggregateError(
      reasons,
      `30 日リフレッシュ: ${stale.length} 件中 ${reasons.length} 件が失敗した`,
    )
  }
}
