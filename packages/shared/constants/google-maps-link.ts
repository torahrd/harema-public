/**
 * Google マップの外部リンクの公式 URL 形式(spec §7 の逐語形。Places の課金対象外)。
 * 店舗詳細の web と mobile が同じ物を使う(写さない)。`googlePlaceId` は Google の Place ID(URL に入るので呼び出し側で検証済みの値を渡す)。
 */
export function googleMapsHref(displayName: string, googlePlaceId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&query_place_id=${googlePlaceId}`
}
