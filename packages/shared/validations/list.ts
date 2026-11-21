import { z } from 'zod'
import { LIST_ICON_MAX_LENGTH, LIST_NAME_MAX_LENGTH } from '../constants'
import { codePointLength } from './char-length'
import { hasForbiddenUsernameCharacter } from './username'

/**
 * リストの名前: 前後空白を trim した上で、コードポイントで 1〜30 文字(DB CHECK
 * `char_length(name) between 1 and 30` の鏡像)。不可視・制御・方向制御文字は拒む(`username` と同じ判定を使う)。
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
 * 一覧に在る値かの判定(`listIconSchema`)は、アイコンの種類を決めた後の単位で足す。ここはその前の最小の受け口。
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
 * `icon` は長さだけを見る(中身は未検証)。画面の単位で中身の検証のスキーマに差し替える。
 */
export const createListInputSchema = z.object({
  name: listNameSchema,
  icon: listIconLengthSchema.nullable().optional(),
})
export type CreateListInput = z.infer<typeof createListInputSchema>

/** リストの名前とアイコンを変える入力。変える項目を 1 つ以上要る。 */
export const updateListInputSchema = z
  .object({
    listId: listIdSchema,
    name: listNameSchema.optional(),
    icon: listIconLengthSchema.nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.icon !== undefined)
export type UpdateListInput = z.infer<typeof updateListInputSchema>
