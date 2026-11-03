/**
 * places キャッシュの有効期間。cached_at 超過で lat/lng を再取得する(spec §4.3)。
 * 29 日 = DB の毎時の処理が座標を null にする線(migration 20261103000001_place_coords_retention.sql の
 * `purge_stale_place_coordinates` 本体の `interval '29 days'`)。表示時の取り直しは、座標が消えた行を
 * 1 日遅れずに戻すためにこの線に揃える。規約の上限は 30 日。
 */
export const PLACE_CACHE_TTL_DAYS = 29

/**
 * 表示用 Place Details をクライアントのメモリに保つ時間(spec §4.3「5〜10 分保持」)。
 * 範囲の上端を採る —— 保持が長いほど同一 place_id の再取得が減る。
 */
export const PLACE_DETAILS_MEMORY_TTL_MS = 10 * 60 * 1000

/**
 * 表示時の取り直しで 1 回の描画あたりに再取得する上限件数(spec §4.3)。
 * 上限を持たないと、1 回の表示で Place Details の per-day quota cap を使い切りうる。
 * 定期の取り直しの 1 日の上限は `PLACE_REFRESH_DAILY_LIMIT`(役割が違うので 1 つにしない)。
 */
export const PLACE_REFRESH_BATCH_LIMIT = 20

/**
 * 定期の取り直し(Vercel Cron → `/api/cron/refresh-places`)が 1 日に取り直す上限件数(spec §4.3)。
 * 取り直しの対象は保存されていて cached_at が 22 日より前の行(`claim_place_refresh_batch` 本体の
 * `interval '22 days'`)、消す線は 29 日(`purge_stale_place_coordinates` 本体の `interval '29 days'`)。
 * どちらも migration `20261103000001_place_coords_retention.sql`。40 件 × 22 日で約 880 店を保てる。
 * 値の決め直しは docs/release-runbook.md の R7。
 */
export const PLACE_REFRESH_DAILY_LIMIT = 40

/** 認証メール・メール変更の再送レートリミット(spec §6.1 / §6.4)。 */
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60
