import 'server-only'

import { classifyPlaceTypes, isFoodPlaceType } from '@harema/shared/constants'
import type {
  MobileAutocompleteRequest,
  MobilePlaceDetailsRequest,
  MobilePlaceDetailsResponse,
  MobileSuggestionGroups,
} from '@harema/shared/validations'
import { serverEnv } from '@/env/server'
import {
  buildAutocompleteRequest,
  buildDetailsRequest,
  readAutocompleteResponse,
  readDetailsResponse,
} from './mobile-places-core'

/**
 * mobile の受け口が Google Places API (New) の REST を呼ぶ口(サーバの鍵 `GOOGLE_PLACES_API_KEY`)。
 * 要求の組み立てと応答の読み取りは `mobile-places-core.ts`。ここは送るだけ(`cache: 'no-store'`・5 秒で打ち切り)。
 * 呼ぶ前に利用者の確かめ(`handleMobileApi`)と入力の検証が済んでいること。店名・住所・types は保存も記録もしない。
 */

const PLACES_TIMEOUT_MS = 5_000

/** 候補。失敗(通信・非 2xx・形の違い)は null。 */
export async function fetchMobileSuggestions(
  request: MobileAutocompleteRequest,
): Promise<MobileSuggestionGroups | null> {
  const built = buildAutocompleteRequest(request)
  // 外へ出る呼び出しの数え方。fetch の直前に固定の 1 行だけ(識別子・店名・座標を含めない)
  console.log('places.autocomplete.mobile_call')
  let response: Response
  try {
    response = await fetch(built.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': serverEnv.googlePlacesApiKey,
        'X-Goog-FieldMask': built.fieldMask,
      },
      body: JSON.stringify(built.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  try {
    return readAutocompleteResponse(await response.json(), classifyPlaceTypes)
  } catch {
    return null
  }
}

export type MobilePlaceDetailsOutcome =
  | { kind: 'ok'; response: MobilePlaceDetailsResponse }
  | { kind: 'not_found' }
  | { kind: 'failed' }

/** 用途ごとの Place Details。実在しない(404)は `not_found`、そのほかの失敗は `failed`。 */
export async function fetchMobilePlaceDetails(
  request: MobilePlaceDetailsRequest,
): Promise<MobilePlaceDetailsOutcome> {
  const built = buildDetailsRequest(request.placeId, request.purpose, request.sessionToken)
  console.log('places.details.mobile_call')
  let response: Response
  try {
    response = await fetch(built.url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': serverEnv.googlePlacesApiKey,
        'X-Goog-FieldMask': built.fieldMask,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    })
  } catch {
    return { kind: 'failed' }
  }
  if (response.status === 404) return { kind: 'not_found' }
  if (!response.ok) return { kind: 'failed' }
  try {
    const parsed = readDetailsResponse(request.purpose, await response.json(), isFoodPlaceType)
    return parsed === null ? { kind: 'failed' } : { kind: 'ok', response: parsed }
  } catch {
    return { kind: 'failed' }
  }
}
