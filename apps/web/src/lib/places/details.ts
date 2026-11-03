import 'server-only'

import { serverEnv } from '@/env/server'

/**
 * 保存時のサーバ側 Place Details(spec §4.2 の「保存シート S1(保存時・サーバ)」)。
 *
 * クライアントから来るのは google_place_id だけで、実在検証と lat/lng の確定はここが行う
 * (spec §11.1-8)—— クライアント供給の座標は信用せず、upsert_place へ渡すのはこの戻り値のみ。
 *
 * フィールドマスクは **id,location に固定**。両方とも Place Details Essentials 帯で、保存 1 回
 * あたり Essentials 1 件が恒常コストになる。**displayName を足すと 1 フィールドで Pro へ跳ねる**
 * ので足さない(S-1 裁定)。店名・住所は places に保存できない以上、ここで取る理由も無い。
 */

const PLACE_DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places/'

/** 課金帯を決める唯一の値。散らさず 1 箇所に置く(S-1 裁定 / WP-08 契約 G15)。 */
const PLACE_DETAILS_FIELD_MASK = 'id,location'

const PLACE_DETAILS_TIMEOUT_MS = 5_000

export type ResolvedPlace = {
  googlePlaceId: string
  latitude: number
  longitude: number
}

/** 外部 JSON なので形を信用せず、必要な 3 値が揃っているときだけ通す。 */
function toResolvedPlace(body: unknown): ResolvedPlace | null {
  if (typeof body !== 'object' || body === null) return null
  if (!('id' in body) || !('location' in body)) return null

  const { id, location } = body
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof location !== 'object' || location === null) return null
  if (!('latitude' in location) || !('longitude' in location)) return null

  const { latitude, longitude } = location
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null
  return { googlePlaceId: id, latitude, longitude }
}

/**
 * Place ID を Google に問い合わせ、実在すれば座標つきで返す。実在しない(404)・エラー・
 * 応答が想定の形でない場合は **null**。呼び出し元は null なら upsert_place を呼ばずに終える。
 * 例外や Google の応答内容はクライアントへ出さない。
 */
export async function fetchPlaceLocation(
  googlePlaceId: string,
): Promise<ResolvedPlace | null> {
  const endpoint = `${PLACE_DETAILS_ENDPOINT}${encodeURIComponent(googlePlaceId)}`

  // 外へ出る呼び出しの数え方(検査 LR-B14)。fetch の直前に固定の 1 行だけを出す —— 識別子・座標・
  // 応答を含めない。1 呼び出し 1 行。利用者の経路は getVerifiedUser、定期の取り直しは CRON_SECRET の照合を通った後だけ。
  console.log('places.details.server_call')

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': serverEnv.googlePlacesApiKey,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(PLACE_DETAILS_TIMEOUT_MS),
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  try {
    return toResolvedPlace(await response.json())
  } catch {
    return null
  }
}
