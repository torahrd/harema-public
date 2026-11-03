/**
 * Autocomplete 候補 / POI の分類に使う Google Place type 集合。
 *
 * 検索は「無フィルタ 1 リクエスト」で取得し、候補の types をこの集合と交差させて
 * クライアント側で「飲食」「場所」へ振り分ける(非該当は破棄)。POI ラベルタップも
 * 同じ飲食判定を使う。集合は代表クエリの実測で微調整する前提(定数として集約する)。
 */

/**
 * 飲食カテゴリ。Places API (New) Table A の飲食系「包括型」由来。
 * 詳細型(ramen_restaurant / sushi_restaurant 等)は Google が同じ types 配列へ包括型
 * `restaurant` を併記するため、包括型との交差で拾える。`food` は旧来の包括型。
 * 出典: Google Places API (New) Place Types Table A(飲食カテゴリ)。
 */
export const FOOD_PLACE_TYPES = [
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'meal_takeaway',
  'meal_delivery',
  'food',
] as const

/**
 * 場所(駅・地名系)。Google Places / Geocoding の地物・行政区画型由来。
 * 出典: Google Places API Place Types(駅・transit)+ Geocoding address types(locality 等)。
 */
export const LOCATION_PLACE_TYPES = [
  'train_station',
  'subway_station',
  'transit_station',
  'light_rail_station',
  'bus_station',
  'locality',
  'sublocality',
  'sublocality_level_1',
  'neighborhood',
  'administrative_area_level_1',
  'administrative_area_level_2',
] as const

const FOOD_PLACE_TYPE_SET: ReadonlySet<string> = new Set(FOOD_PLACE_TYPES)
const LOCATION_PLACE_TYPE_SET: ReadonlySet<string> = new Set(LOCATION_PLACE_TYPES)

/** types に飲食系包括型が 1 つでもあれば飲食とみなす(POI タップの飲食判定にも使う)。 */
export function isFoodPlaceType(types: readonly string[]): boolean {
  return types.some((type) => FOOD_PLACE_TYPE_SET.has(type))
}

/**
 * 候補の types を「飲食」「場所」へ分類する。両方に該当し得ないよう飲食を優先し、
 * どちらにも該当しなければ null(破棄対象)。
 */
export function classifyPlaceTypes(
  types: readonly string[],
): 'food' | 'location' | null {
  if (isFoodPlaceType(types)) return 'food'
  if (types.some((type) => LOCATION_PLACE_TYPE_SET.has(type))) return 'location'
  return null
}
