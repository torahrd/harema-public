import type { SavedPlaceStatus } from '@harema/shared/constants'

/**
 * 地図に描くピン 1 点。DB の lat/lng と状態のみを持つ(Places API 由来の店名・住所・types は
 * 持たない = 規約遵守)。もういい(no_thanks)は地図に出さない不変を型に載せる(page.tsx が
 * クエリ層で除外し、その narrowing がそのまま流れる)。
 */
export type SavedPlaceMarker = {
  id: string
  status: Exclude<SavedPlaceStatus, 'no_thanks'>
  latitude: number
  longitude: number
}

/**
 * S1(保存/編集シート・WP-08)へ渡す起動コンテキスト。検索の選択確定と飲食 POI タップの終端で
 * 組み立て、WP-08 がこの型を入口に S1 を差す。DB へ書かれるのは google_place_id と
 * サーバ検証済み lat/lng のみ —— **表示名と住所は S1 の表示用でクライアント内に留め、
 * サーバへ送りも永続化もしない**(Places API 規約:places に店名・住所を保存しない)。
 */
export type MapLaunchContext = {
  googlePlaceId: string
  displayName: string
  formattedAddress: string
  location: { lat: number; lng: number } | null
}

/** 検索モード。店舗 = 飲食のみフラット表示 / マップ = 場所 + 飲食店の 2 グループ。 */
export type SearchMode = 'store' | 'map'

/**
 * 検索失敗トーストの 2 種(design ④)。直前の操作が違うので文言を分ける ——
 * suggestions = 入力中の候補取得失敗(次の一手は「検索」)/ details = 選択後の詳細取得失敗
 * (次の一手は「選び直し」)。選んだ直後に「検索に失敗」では次の一手が分からないため。
 */
export type SearchErrorVariant = 'suggestions' | 'details'

/**
 * 上部トーストの種別。検索失敗 2 種(design ④)+ 保存成功 2 種(spec §6.2「保存後はシートを
 * 閉じてトースト」)。成功を新規 / 更新で分けるのは、CTA が「保存する」/「更新する」で分かれて
 * いるのに結果の報せを対応させるため。
 */
export type MapToastVariant = SearchErrorVariant | 'save-created' | 'save-updated'
