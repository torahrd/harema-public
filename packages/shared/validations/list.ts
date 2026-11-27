import { z } from 'zod'
import { LIST_BULK_MAX, LIST_ICON_MAX_LENGTH, LIST_MAX_PER_USER, LIST_NAME_MAX_LENGTH } from '../constants'
import { codePointLength } from './char-length'
import { listIconSchema } from './list-icon'
import { googlePlaceIdSchema, savedPlaceIdSchema } from './saved-place'
import { hasForbiddenUsernameCharacter } from './username'

/**
 * リストの名前: 前後空白を trim した上で、コードポイントで 1〜15 文字(DB CHECK
 * `char_length(name) between 1 and 15` の鏡像)。不可視・制御・方向制御文字は拒む(`username` と同じ判定を使う)。
 * DB は長さだけを見る(文字種はアプリ層 Zod だけで判定する)。パース結果は trim 後の値で、保存されるのはこの値。
 */
export const listNameSchema = z
  .string()
  .trim()
  .refine((value) => !hasForbiddenUsernameCharacter(value))
  .refine((value) => {
    const length = codePointLength(value)
    return length >= 1 && length <= LIST_NAME_MAX_LENGTH
  })

/** `lists.id`(内部 uuid)。 */
export const listIdSchema = z.uuid()

/**
 * リストのアイコンの長さだけの検査(DB CHECK `char_length(icon) between 1 and 32` の鏡像)。
 * 1 文字かの判定は `listIconSchema`(`list-icon.ts`)が持つ。ここは DB の CHECK と同じ長さだけの検査(DB の鏡像として残す)。
 */
export const listIconLengthSchema = z
  .string()
  .refine((value) => {
    const length = codePointLength(value)
    return length >= 1 && length <= LIST_ICON_MAX_LENGTH
  })

/**
 * リストを作る入力。利用者の ID は入れない(サーバが検証済みの `sub` を使う)。
 * 余分な鍵(`userId` など)は strip されて出力に残らない。
 * `icon` は 1 文字か null(`listIconSchema`)。
 */
export const createListInputSchema = z.object({
  name: listNameSchema,
  icon: listIconSchema.optional(),
})
export type CreateListInput = z.infer<typeof createListInputSchema>

/** リストの名前とアイコンを変える入力。変える項目を 1 つ以上要る。 */
export const updateListInputSchema = z
  .object({
    listId: listIdSchema,
    name: listNameSchema.optional(),
    icon: listIconSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.icon !== undefined)
export type UpdateListInput = z.infer<typeof updateListInputSchema>

/** リストを消す入力。 */
export const deleteListInputSchema = z.object({ listId: listIdSchema })
export type DeleteListInput = z.infer<typeof deleteListInputSchema>

/**
 * 一括でリストへ入れる・外す入力(一覧の「選ぶ」から)。店は `saved_places.id`(自分の行を指すためだけ。
 * 持ち主の判定には使わない)で 1〜`LIST_BULK_MAX` 個。利用者の ID は入れない。
 */
export const listPlacesChangeSchema = z.object({
  listId: listIdSchema,
  savedPlaceIds: z.array(savedPlaceIdSchema).min(1).max(LIST_BULK_MAX),
  op: z.enum(['add', 'remove']),
})
export type ListPlacesChange = z.infer<typeof listPlacesChangeSchema>

/**
 * 保存のシートからの、店ごとのリストの入れ替え。`listIds` は「この店を入れたいリスト」の全部
 * (0 個 = どれにも入れない)。重複は拒む。
 */
export const placeListsInputSchema = z.object({
  googlePlaceId: googlePlaceIdSchema,
  listIds: z
    .array(listIdSchema)
    .max(LIST_MAX_PER_USER)
    .refine((ids) => new Set(ids).size === ids.length),
})
export type PlaceListsInput = z.infer<typeof placeListsInputSchema>
