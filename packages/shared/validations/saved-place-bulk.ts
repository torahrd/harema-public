import { z } from 'zod'
import { LIST_BULK_MAX } from '../constants'
import { savedPlaceIdSchema, savedPlaceStatusSchema } from './saved-place'
import { isAllowedStatusChange } from './status-transition'

/**
 * 保存した店の「一括の状態の変更」「一括の削除」の入力(一覧の「選ぶ」から)。
 * 店は `saved_places.id`(自分の行を指すためだけ。持ち主の判定には使わない)で 1〜`LIST_BULK_MAX` 個。
 * 利用者の ID は入れない(サーバが検証済みの `sub` を使う)。余分な鍵は strip されて出力に残らない。
 */
const savedPlaceIdsSchema = z.array(savedPlaceIdSchema).min(1).max(LIST_BULK_MAX)

/**
 * 一括の状態の変更。`from` は「今の状態」で、サーバの更新の条件(`status = from`)にも使う
 * (実際の状態が `from` でない行は変えない。client の `from` が偽でも、起きるのは 0 行か表が許す遷移だけ)。
 * 遷移の表は `isAllowedStatusChange`(評価済みから「行きたい」へは戻せない)をそのまま使い、同じ状態への変更は拒む。
 */
export const bulkStatusChangeSchema = z
  .object({
    savedPlaceIds: savedPlaceIdsSchema,
    from: savedPlaceStatusSchema,
    to: savedPlaceStatusSchema,
  })
  .refine((value) => value.from !== value.to && isAllowedStatusChange(value.from, value.to))
export type BulkStatusChange = z.infer<typeof bulkStatusChangeSchema>

/** 一括の削除。 */
export const bulkDeleteSavedPlacesSchema = z.object({ savedPlaceIds: savedPlaceIdsSchema })
export type BulkDeleteSavedPlaces = z.infer<typeof bulkDeleteSavedPlacesSchema>
