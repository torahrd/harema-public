import { z } from 'zod'
import { SOURCE_TEXT_MAX_LENGTH } from '../constants'
import { codePointLength } from './char-length'
import { googlePlaceIdSchema } from './saved-place'

/**
 * mobile 用の web の受け口(`/api/mobile/v1/places/*`)の入出力。web 側の Route Handler と mobile が同じ型を読む。
 * クライアントが選べるのは「用途」までで、Google に送る field の mask はサーバの表が決める(クライアントは field を選べない)。
 */

/** Autocomplete の入力の長さ(コードポイント)。 */
export const MOBILE_AUTOCOMPLETE_INPUT_MAX_LENGTH = 100

/**
 * セッションの札。Google の上限は「URL とファイル名に安全な base64 で ASCII 36 文字以内」
 * (Places API (New) の REST 参照 `places/autocomplete`・`places/get` の `sessionToken`)。
 * 下限の 16 は UUID を捨てた短い札を弾くための値(mobile は `randomUUID()` = 36 文字を送る)。
 */
export const MOBILE_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,36}$/

const finiteInRange = (min: number, max: number) =>
  z.number().refine((value) => Number.isFinite(value) && value >= min && value <= max)

/** 地図の表示範囲(矩形)。南西の角 = (south, west)・北東の角 = (north, east)。 */
export const mobileLocationBiasSchema = z
  .object({
    south: finiteInRange(-90, 90),
    west: finiteInRange(-180, 180),
    north: finiteInRange(-90, 90),
    east: finiteInRange(-180, 180),
  })
  .refine((bias) => bias.south <= bias.north)

export const mobileAutocompleteRequestSchema = z.object({
  input: z
    .string()
    .trim()
    .refine((value) => {
      const length = codePointLength(value)
      return length >= 1 && length <= MOBILE_AUTOCOMPLETE_INPUT_MAX_LENGTH
    }),
  sessionToken: z.string().regex(MOBILE_SESSION_TOKEN_PATTERN),
  /** 必須。送らないと Google はサーバの IP の位置で候補を寄せる。 */
  locationBias: mobileLocationBiasSchema,
})

export type MobileAutocompleteRequest = z.output<typeof mobileAutocompleteRequestSchema>

export const MOBILE_PLACE_DETAILS_PURPOSES = [
  'select_food',
  'select_location',
  'poi',
  'summary',
  'enterprise',
] as const

export type MobilePlaceDetailsPurpose = (typeof MOBILE_PLACE_DETAILS_PURPOSES)[number]

export const mobilePlaceDetailsRequestSchema = z
  .object({
    placeId: googlePlaceIdSchema,
    purpose: z.enum(MOBILE_PLACE_DETAILS_PURPOSES),
    sessionToken: z.string().regex(MOBILE_SESSION_TOKEN_PATTERN).optional(),
  })
  .refine(
    // 札は候補のセッションを閉じる確定(select_*)のときだけ受ける。他の用途で来たら拒む
    (request) =>
      request.sessionToken === undefined ||
      request.purpose === 'select_food' ||
      request.purpose === 'select_location',
  )

export type MobilePlaceDetailsRequest = z.output<typeof mobilePlaceDetailsRequestSchema>

/**
 * 出典 URL のタイトル取得の要求。本文は `url` だけ。URL かどうか(http / https・認証情報なし)の判定は
 * `sourceUrlSchema` が行う(URL でない自由記述は `not_a_url` で返す)ので、ここでは文字列と長さだけを見る。
 */
export const mobileSourceTitleRequestSchema = z.object({
  url: z.string().refine((value) => codePointLength(value) <= SOURCE_TEXT_MAX_LENGTH),
})

/**
 * 候補の 1 件。types は返さない(分類はサーバで済ませる)。
 * rank = Google が返した順の 0 始まりの番号(分類で捨てた候補は数えない)。スイッチがオンの時に
 * 飲食と場所を Google の順のまま混ぜるのに使う。
 */
export type MobileSuggestion = {
  placeId: string
  mainText: string
  secondaryText: string
  rank: number
}

export type MobileSuggestionGroups = {
  food: MobileSuggestion[]
  location: MobileSuggestion[]
}

export type MobileAutocompleteResponse = { ok: true; suggestions: MobileSuggestionGroups }

type LatLng = { lat: number; lng: number }

/** 用途ごとの Place Details の応答の形(成功)。 */
export type MobilePlaceDetailsResponse =
  | {
      ok: true
      purpose: 'select_food'
      displayName: string
      formattedAddress: string
      location: LatLng
    }
  | {
      ok: true
      purpose: 'select_location'
      location: LatLng
      viewport: { south: number; west: number; north: number; east: number } | null
    }
  | { ok: true; purpose: 'poi'; food: false }
  | {
      ok: true
      purpose: 'poi'
      food: true
      displayName: string
      formattedAddress: string
      location: LatLng
    }
  | { ok: true; purpose: 'summary'; displayName: string; formattedAddress: string }
  | {
      ok: true
      purpose: 'enterprise'
      weekdayDescriptions: string[] | null
      nationalPhoneNumber: string | null
      websiteUri: string | null
    }

/**
 * 保存の結果(Server Action `savePlace` と `/api/mobile/v1/saved-places` が同じ形で返す)。
 * mobile も web もこの型を読む(写さない — 理由が増えたら両方の型が同時に変わる)。
 */
export type SavePlaceResult =
  | { ok: true; mode: 'created' | 'updated' }
  | {
      ok: false
      reason:
        | 'invalid_input'
        | 'unauthenticated'
        | 'place_not_found'
        | 'status_reverted'
        | 'conflict'
        | 'failed'
    }

/** 出典のタイトルの結果(Server Action `fetchSourceTitle` と `/api/mobile/v1/source-title`)。 */
export type FetchSourceTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: 'not_a_url' | 'unauthenticated' | 'unavailable' }

