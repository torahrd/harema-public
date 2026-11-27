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
import type { Locale } from '@harema/shared/i18n'
import type { MobileAutocompleteRequest, MobilePlaceDetailsPurpose, MobilePlaceDetailsResponse, MobileSuggestionGroups } from '@harema/shared/validations'

export const PLACES_ORIGIN = 'https://places.googleapis.com'
export const AUTOCOMPLETE_URL = `${PLACES_ORIGIN}/v1/places:autocomplete`
/**
 * `languageCode` は、検証した表示言語(`language`・許可リストの 2 値)だけを渡す。無い要求(古い iOS 1.0.1)は `ja`。
 * `regionCode` は言語と切り離して `JP` に固定する(日本の店を探す製品。候補の順位にも効く)。
 */
export const PLACES_DEFAULT_LANGUAGE: Locale = 'ja'
export const PLACES_REGION_CODE = 'JP'

/** Autocomplete の応答の mask。 */
export const AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types'

/** 用途 → Place Details の mask(REST の綴り)。課金帯を決める唯一の表。散らさない。 */
export const DETAILS_FIELD_MASKS: Record<MobilePlaceDetailsPurpose, string> = {
  // addressComponents(Essentials)は国を見分けるためだけに足す(英語の画面の日本語の店名の札・harema#219)。応答には国の 2 字だけを返す
  select_food: 'location,displayName,formattedAddress,addressComponents',
  select_location: 'location,viewport',
  poi: 'types,displayName,location,formattedAddress,addressComponents',
  summary: 'displayName,formattedAddress,addressComponents',
  enterprise: 'regularOpeningHours,nationalPhoneNumber,websiteUri',
  // 英語の画面の日本語の店名。displayName だけ(言語 languageCode は mask を変えずに displayName の中に入る)
  name_ja: 'displayName',
}

/**
 * 用途 → サーバが固定する `languageCode`。この表にある用途は、クライアントが送る `language` を使わない
 * (`name_ja` は英語の画面から呼ばれても必ず日本語で取る)。表に無い用途は要求の `language`。
 */
export const DETAILS_FIXED_LANGUAGES: Partial<Record<MobilePlaceDetailsPurpose, Locale>> = {
  name_ja: 'ja',
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

/**
 * 検証済みの要求(`mobileAutocompleteRequestSchema` の出力)から Google への要求を組む。
 * `language` が無ければ `ja`(スキーマの省略時の値と同じ。単体の呼び出しの備え)。
 */
export function buildAutocompleteRequest(
  request: Omit<MobileAutocompleteRequest, 'language'> & { language?: Locale },
): AutocompleteHttpRequest {
  const { south, west, north, east } = request.locationBias
  return {
    url: AUTOCOMPLETE_URL,
    fieldMask: AUTOCOMPLETE_FIELD_MASK,
    body: {
      input: request.input,
      languageCode: request.language ?? PLACES_DEFAULT_LANGUAGE,
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
  language: Locale = PLACES_DEFAULT_LANGUAGE,
): DetailsHttpRequest {
  const fieldMask = Object.hasOwn(DETAILS_FIELD_MASKS, purpose) ? DETAILS_FIELD_MASKS[purpose] : undefined
  if (fieldMask === undefined) throw new Error('unknown purpose')
  // 固定の言語がある用途は、引数の language より先にそれを使う(クライアントが言語を選べない)
  const fixedLanguage = Object.hasOwn(DETAILS_FIXED_LANGUAGES, purpose) ? DETAILS_FIXED_LANGUAGES[purpose] : undefined
  const query = new URLSearchParams({
    languageCode: fixedLanguage ?? language,
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

// 言語タグの形(`en`・`ja-JP`・`zh-Hant-TW`)。長さの上限は BCP-47 の実用上の長さ(35 字)。
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i
const LANGUAGE_TAG_MAX_LENGTH = 35

/** `displayName.languageCode`。言語タグの形の文字列だけ返し、それ以外(無い・数・長い・記号入り)は null。 */
function readLanguageCode(value: unknown): string | null {
  if (!isObject(value)) return null
  const code = value.languageCode
  if (typeof code !== 'string' || code.length > LANGUAGE_TAG_MAX_LENGTH || !LANGUAGE_TAG.test(code)) return null
  return code
}

// 国の部品の `shortText`(ISO 3166-1 の 2 字。大文字)
const COUNTRY_CODE = /^[A-Z]{2}$/

/**
 * `addressComponents` → 国の 2 字。`types` に `country` を含む部品の `shortText` が大文字 2 字の時だけ返し、
 * それ以外(部品が無い・配列でない・形が違う・小文字・3 字)は null(投げない)。番地・郵便番号・市区町村の部品は読まない・返さない。
 * (web の `packages/shared/ja-name` の `countryCodeOf` と同じ決め方。この file は値の import を持たない約束なので、ここに書く。)
 */
function readCountryCode(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const component of value) {
    if (!isObject(component)) continue
    if (!readStringArray(component.types).includes('country')) continue
    const shortText = component.shortText
    return typeof shortText === 'string' && COUNTRY_CODE.test(shortText) ? shortText : null
  }
  return null
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
        displayNameLanguageCode: readLanguageCode(json.displayName),
        countryCode: readCountryCode(json.addressComponents),
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
        displayNameLanguageCode: readLanguageCode(json.displayName),
        countryCode: readCountryCode(json.addressComponents),
        formattedAddress: typeof json.formattedAddress === 'string' ? json.formattedAddress : '',
        location,
      }
    }
    case 'summary':
      return {
        ok: true,
        purpose,
        displayName: readText(json.displayName),
        displayNameLanguageCode: readLanguageCode(json.displayName),
        countryCode: readCountryCode(json.addressComponents),
        formattedAddress: typeof json.formattedAddress === 'string' ? json.formattedAddress : '',
      }
    // 住所・座標は mask に無く、返さない(店名と言語の 4 つだけ)
    case 'name_ja':
      return {
        ok: true,
        purpose,
        displayName: readText(json.displayName),
        displayNameLanguageCode: readLanguageCode(json.displayName),
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
