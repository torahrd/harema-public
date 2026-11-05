/**
 * mobile の受け口(`/api/mobile/v1/places/*`)が Google Places API (New) の REST に送る要求の組み立てと、
 * 応答の読み取り。純粋な核(`lib/auth/core.ts` と同じ約束): 値の import を持たない・env を読まない・通信しない。
 *
 * 原文で確かめた綴り(2026-11-02 に読んだ Google の公式文書):
 * - Autocomplete (New): `POST https://places.googleapis.com/v1/places:autocomplete`。本文の `input`・`locationBias.rectangle`
 *   (`low` / `high` に `latitude` / `longitude`)・`languageCode`・`regionCode`・`sessionToken`(URL とファイル名に安全な
 *   base64・ASCII 36 文字以内)。応答は `suggestions[].placePrediction`(`placeId`・`structuredFormat.mainText.text` /
 *   `secondaryText.text`・`types`)。`locationBias` も `locationRestriction` も送らないと IP で寄せる。
 *   https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/autocomplete
 *   https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 * - Place Details (New): `GET https://places.googleapis.com/v1/places/{placeId}`。query の `languageCode`・`regionCode`・
 *   `sessionToken`(同じ制約。セッションを閉じるのは Details の呼び出し)。返す項目は header `X-Goog-FieldMask`。
 *   https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/get
 *
 * クライアントが選べるのは「用途」だけ。field の mask はこの file の表が決める(クライアントは field を選べない)。
 */
import type { MobileAutocompleteRequest, MobilePlaceDetailsPurpose, MobilePlaceDetailsResponse, MobileSuggestionGroups } from '@harema/shared/validations'

export const PLACES_ORIGIN = 'https://places.googleapis.com'
export const AUTOCOMPLETE_URL = `${PLACES_ORIGIN}/v1/places:autocomplete`
export const PLACES_LANGUAGE_CODE = 'ja'
export const PLACES_REGION_CODE = 'JP'

/** Autocomplete の応答の mask。 */
export const AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types'

/** 用途 → Place Details の mask(REST の綴り)。課金帯を決める唯一の表。散らさない。 */
export const DETAILS_FIELD_MASKS: Record<MobilePlaceDetailsPurpose, string> = {
  select_food: 'location,displayName,formattedAddress',
  select_location: 'location,viewport',
  poi: 'types,displayName,location,formattedAddress',
  summary: 'displayName,formattedAddress',
  enterprise: 'regularOpeningHours,nationalPhoneNumber,websiteUri',
}

/** セッションを閉じる(札を送る)用途。 */
const SESSION_PURPOSES: ReadonlySet<MobilePlaceDetailsPurpose> = new Set(['select_food', 'select_location'])

export type AutocompleteHttpRequest = {
  url: string
  fieldMask: string
  body: {
    input: string
    languageCode: string
    regionCode: string
    sessionToken: string
    locationBias: {
      rectangle: {
        low: { latitude: number; longitude: number }
        high: { latitude: number; longitude: number }
      }
    }
  }
}

/** 検証済みの要求(`mobileAutocompleteRequestSchema` の出力)から Google への要求を組む。 */
export function buildAutocompleteRequest(request: MobileAutocompleteRequest): AutocompleteHttpRequest {
  const { south, west, north, east } = request.locationBias
  return {
    url: AUTOCOMPLETE_URL,
    fieldMask: AUTOCOMPLETE_FIELD_MASK,
    body: {
      input: request.input,
      languageCode: PLACES_LANGUAGE_CODE,
      regionCode: PLACES_REGION_CODE,
      sessionToken: request.sessionToken,
      locationBias: {
        rectangle: {
          low: { latitude: south, longitude: west },
          high: { latitude: north, longitude: east },
        },
      },
    },
  }
}

export type DetailsHttpRequest = { url: string; fieldMask: string }

/**
 * 用途と place ID から Place Details の要求を組む。表に無い用途は投げる(呼び出し側が先に検証する)。
 * place ID は `encodeURIComponent`。`sessionToken` は `select_*` のときだけ URL に付ける。
 */
export function buildDetailsRequest(
  placeId: string,
  purpose: MobilePlaceDetailsPurpose,
  sessionToken?: string,
): DetailsHttpRequest {
  const fieldMask = Object.hasOwn(DETAILS_FIELD_MASKS, purpose) ? DETAILS_FIELD_MASKS[purpose] : undefined
  if (fieldMask === undefined) throw new Error('unknown purpose')
  const query = new URLSearchParams({
    languageCode: PLACES_LANGUAGE_CODE,
    regionCode: PLACES_REGION_CODE,
  })
  if (sessionToken !== undefined && SESSION_PURPOSES.has(purpose)) query.set('sessionToken', sessionToken)
  return {
    url: `${PLACES_ORIGIN}/v1/places/${encodeURIComponent(placeId)}?${query.toString()}`,
    fieldMask,
  }
}

// ── 応答の読み取り(外部 JSON は形を信用しない。想定の形でなければ null) ─────────────

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string {
  return isObject(value) && typeof value.text === 'string' ? value.text : ''
}

function readLatLng(value: unknown): { latitude: number; longitude: number } | null {
  if (!isObject(value)) return null
  const { latitude, longitude } = value
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

function readLocation(value: unknown): { lat: number; lng: number } | null {
  const point = readLatLng(value)
  return point === null ? null : { lat: point.latitude, lng: point.longitude }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export type ClassifyPlaceTypes = (types: readonly string[]) => 'food' | 'location' | null

/** Autocomplete の応答 → 飲食 / 場所に分けた候補。types は返さない。どちらでもない候補は消える。 */
export function readAutocompleteResponse(
  json: unknown,
  classify: ClassifyPlaceTypes,
): MobileSuggestionGroups | null {
  if (!isObject(json)) return null
  const groups: MobileSuggestionGroups = { food: [], location: [] }
  const suggestions = json.suggestions
  // 候補が 0 件のとき Google は `suggestions` を含めない
  if (suggestions === undefined) return groups
  if (!Array.isArray(suggestions)) return null
  // rank: 残した候補への 0 始まりの通し番号(群ごとでなく、捨てた候補は数えない)
  let rank = 0
  for (const item of suggestions) {
    if (!isObject(item) || !isObject(item.placePrediction)) continue
    const prediction = item.placePrediction
    const placeId = prediction.placeId
    if (typeof placeId !== 'string' || placeId.length === 0) continue
    const bucket = classify(readStringArray(prediction.types))
    if (bucket === null) continue
    const structured = isObject(prediction.structuredFormat) ? prediction.structuredFormat : {}
    const mainText = readText(structured.mainText)
    if (mainText.length === 0) continue
    groups[bucket].push({
      placeId,
      mainText,
      secondaryText: readText(structured.secondaryText),
      rank,
    })
    rank += 1
  }
  return groups
}

/** 外へ開く URL は http / https だけ(`javascript:` などを通さない)。 */
function readHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null
  try {
    new URL(value)
  } catch {
    return null
  }
  return value
}

/** Place Details の応答 → 用途ごとの形。形が違えば null(投げない)。`poi` の飲食判定は引数で受ける。 */
export function readDetailsResponse(
  purpose: MobilePlaceDetailsPurpose,
  json: unknown,
  isFood: (types: readonly string[]) => boolean,
): MobilePlaceDetailsResponse | null {
  if (!isObject(json)) return null
  switch (purpose) {
    case 'select_food': {
      const location = readLocation(json.location)
      if (location === null) return null
      return {
        ok: true,
        purpose,
        displayName: readText(json.displayName),
        formattedAddress: typeof json.formattedAddress === 'string' ? json.formattedAddress : '',
        location,
      }
    }
    case 'select_location': {
      const location = readLocation(json.location)
      if (location === null) return null
      let viewport: { south: number; west: number; north: number; east: number } | null = null
      if (isObject(json.viewport)) {
        const low = readLatLng(json.viewport.low)
        const high = readLatLng(json.viewport.high)
        if (low !== null && high !== null) {
          viewport = { south: low.latitude, west: low.longitude, north: high.latitude, east: high.longitude }
        }
      }
      return { ok: true, purpose, location, viewport }
    }
    case 'poi': {
      if (!isFood(readStringArray(json.types))) return { ok: true, purpose, food: false }
      const location = readLocation(json.location)
      // 座標が無い飲食は、地図が何もしない(web の POI タップと同じ)
      if (location === null) return { ok: true, purpose, food: false }
      return {
        ok: true,
        purpose,
        food: true,
        displayName: readText(json.displayName),
        formattedAddress: typeof json.formattedAddress === 'string' ? json.formattedAddress : '',
        location,
      }
    }
    case 'summary':
      return {
        ok: true,
        purpose,
        displayName: readText(json.displayName),
        formattedAddress: typeof json.formattedAddress === 'string' ? json.formattedAddress : '',
      }
    case 'enterprise': {
      const hours = isObject(json.regularOpeningHours)
        ? readStringArray(json.regularOpeningHours.weekdayDescriptions)
        : []
      return {
        ok: true,
        purpose,
        weekdayDescriptions: hours.length > 0 ? hours : null,
        nationalPhoneNumber: typeof json.nationalPhoneNumber === 'string' ? json.nationalPhoneNumber : null,
        websiteUri: readHttpUrl(json.websiteUri),
      }
    }
  }
}
