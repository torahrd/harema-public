/**
 * 店舗詳細(④)をどこから開いたか。地図のピンから開くときだけ `?from=map` を付け、戻る先(地図)と
 * 読み上げ名だけを変える。書く側(`placeDetailHrefFromMap`)と読む側(`detailBack`)をここに揃える。
 *
 * 読む側は文字列の `'map'` と完全に一致するときだけ地図。ほか(無い・別の値・配列)は一覧。
 * URL の値は href にも文にも写さない(行き先は固定の 2 つのどちらか)。
 * 相対 import だけ(node の単体から直接読むため)。
 */

export const PLACE_DETAIL_FROM_PARAM = 'from'
export const PLACE_DETAIL_FROM_MAP = 'map'

/** 戻るの行き先と、読み上げ名の鍵(辞書 `web` の下の鍵。言語は画面が引く)。 */
export type DetailBack = {
  href: '/map' | '/saved'
  labelKey: 'savedList.backToMap' | 'placeDetail.backLabel'
}

/** 地図のピンから開く詳細の URL。 */
export function placeDetailHrefFromMap(savedPlaceId: string): string {
  return `/places/${savedPlaceId}?${PLACE_DETAIL_FROM_PARAM}=${PLACE_DETAIL_FROM_MAP}`
}

/** 詳細の戻るの行き先と読み上げ名の鍵。 */
export function detailBack(from: string | string[] | undefined): DetailBack {
  if (from === PLACE_DETAIL_FROM_MAP) return { href: '/map', labelKey: 'savedList.backToMap' }
  return { href: '/saved', labelKey: 'placeDetail.backLabel' }
}
