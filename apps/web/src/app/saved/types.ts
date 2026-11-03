import type { SavedPlaceStatus } from '@harema/shared/constants'

/**
 * 一覧の 1 行。client へ渡すのはこの 4 つだけ。座標(`position`)は一覧の地図のピンのためで、
 * 3 状態とも(自分の行だけ・RLS)。memo・source_* は**構造的に**渡さない
 * (spec §11.1 / 一覧は表示に要る値しか持たない)。`googlePlaceId` を渡すのは、表示用の
 * Place Details をクライアント側で取るため(spec §4.3)。
 */
export type SavedListRow = {
  id: string
  status: SavedPlaceStatus
  googlePlaceId: string
  position: { lat: number; lng: number } | null
}

/**
 * 表示用に取れた 2 値(Pro 帯・spec §4.2)。取得結果はセッション内の表示だけに使い、
 * サーバ・DB へ送らない(Places API 規約:places に店名・住所を保存しない)。
 */
export type PlaceDisplay = {
  displayName: string
  formattedAddress: string
}

/** 3 タブの件数バッジ。DB の件数そのもので、Places API は呼ばない(spec §4.2 に「件数」の行は無い)。 */
export type SavedListCounts = Record<SavedPlaceStatus, number>
