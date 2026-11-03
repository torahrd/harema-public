import { z } from 'zod'
import {
  GOOGLE_PLACE_ID_MAX_LENGTH,
  MEMO_MAX_LENGTH,
  SAVED_PLACE_STATUSES,
  SOURCE_TEXT_MAX_LENGTH,
  SOURCE_TITLE_MAX_LENGTH,
} from '../constants'
import { codePointLength } from './char-length'

/** 保存状態。生成 enum の 3 値。遷移制約(逆戻り不可)はここではなく Server Action で課す。 */
export const savedPlaceStatusSchema = z.enum(SAVED_PLACE_STATUSES)

/** メモ: コードポイントで 500 文字以内(DB CHECK の鏡像)。 */
export const memoSchema = z
  .string()
  .refine((value) => codePointLength(value) <= MEMO_MAX_LENGTH)

/** 出典テキスト/URL: コードポイントで 1000 文字以内(DB CHECK の鏡像)。 */
export const sourceTextSchema = z
  .string()
  .refine((value) => codePointLength(value) <= SOURCE_TEXT_MAX_LENGTH)

/** 出典 URL の OGP(og:title): コードポイントで 200 文字以内(DB CHECK の鏡像)。 */
export const sourceTitleSchema = z
  .string()
  .refine((value) => codePointLength(value) <= SOURCE_TITLE_MAX_LENGTH)

/**
 * Google の Place ID。S1 がサーバへ渡す唯一の外部識別子で、サーバはこれを Place Details に
 * かけて実在検証と lat/lng の確定を行う(spec §11.1-8)。
 */
export const googlePlaceIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => codePointLength(value) <= GOOGLE_PLACE_ID_MAX_LENGTH)

/**
 * `saved_places.id`(内部 uuid)。店舗詳細のルートパラメータをここで検証する
 * (`google_place_id` は URL に出さない。`docs/STATUS.md:202`)。
 */
export const savedPlaceIdSchema = z.uuid()

/** 空欄は DB では NULL。空白だけの入力も空欄として扱う(空文字を保存しない)。 */
const blankToNull = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * S1(保存/編集シート)がサーバへ送る入力の全量。**キーはこの 5 つだけ**で、lat/lng・
 * saved_places.id・新規/編集の別は**構造的に受け取らない**(spec §11.1-8 / WP-08 計画 L-2・L-3)——
 * 座標はサーバが Place Details から取り直し、行の特定は (getUser() の uid, place_id) で行い、
 * 新規か編集かはサーバが既存行の有無で判定する。クライアントと Server Action で同一のこの
 * スキーマを使い、サーバ側でも必ず再検証する(spec §8)。
 */
export const savePlaceInputSchema = z.object({
  googlePlaceId: googlePlaceIdSchema,
  status: savedPlaceStatusSchema,
  memo: memoSchema.transform(blankToNull),
  sourceText: sourceTextSchema.transform(blankToNull),
  sourceTitle: sourceTitleSchema.transform(blankToNull),
})

/** クライアントが組み立てる側の形(空欄は空文字。null 化は検証時の変換が行う)。 */
export type SavePlaceInput = z.input<typeof savePlaceInputSchema>

/** `scheme://` の直後から最初の `/ ? #` までが authority。userinfo(`user:pass@`)はここに出る。 */
const URL_AUTHORITY = /^https?:\/\/([^/?#]*)/i

/**
 * OGP を取りに行ってよい出典 URL。scheme allowlist の一次判定(spec §11.1-7)—— http / https
 * 以外は取りに行かない。`user:pass@` 付きは要求に認証情報を載せることになるので受け付けない
 * (同 §11.1-7「認証情報を付与しない」)。URL として解釈できない自由記述はここで落ち、OGP を
 * 取りに行かないだけで source_text としてはそのまま保存できる(S-12 裁定)。
 */
export const sourceUrlSchema = z.url({ protocol: /^https?$/ }).refine((value) => {
  const authority = URL_AUTHORITY.exec(value.trim())?.[1]
  return authority !== undefined && !authority.includes('@')
})
