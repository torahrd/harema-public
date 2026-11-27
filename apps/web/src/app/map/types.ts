import type { SavedPlaceStatus } from '@harema/shared/constants'

/**
 * 地図に描くピン 1 点。DB の lat/lng と状態のみを持つ(Places API 由来の店名・住所・types は
 * 持たない = 規約遵守)。もういい(no_thanks)は地図に出さない不変を型に載せる(page.tsx が
 * クエリ層で除外し、その narrowing がそのまま流れる)。
 */
export type SavedPlaceMarker = {
  id: string
  /** 押した時に S1 を開くための Google の place_id(POI ラベルを押した時と同じ入口へ渡す)。 */
  googlePlaceId: string
  status: Exclude<SavedPlaceStatus, 'no_thanks'>
  latitude: number
  longitude: number
  /** その店が入っているリストの id(ピンのアイコンと絞りに使う)。 */
  listIds: string[]
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
  /**
   * `displayName` の言語(Google が返した値。返らなければ null か省略)。英語の画面で日本語の店名を取るか
   * (1 回目の名前が日本語か)の判断に使う。これも表示用で、サーバへ送りも永続化もしない。
   */
  displayNameLanguageCode?: string | null
  /**
   * 店の国(1 回目の `addressComponents` の国の部品から。大文字 2 字。分からなければ null か省略)。英語の画面で、
   * 日本にある店だけに「日本語の店名」の札を置くかの判断に使う。これも表示用で、サーバへ送りも永続化もしない(harema#219)。
   */
  countryCode?: string | null
  formattedAddress: string
  location: { lat: number; lng: number } | null
}

/**
 * 検索の範囲(画面に出ない内部の名前)。store = 「飲食店以外を検索結果に含める」スイッチがオフ(飲食だけ) /
 * map = オン(飲食と場所を Google の順のまま見出しなしで混ぜる)。
 */
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
export type MapToastVariant =
  | SearchErrorVariant
  | 'save-created'
  | 'save-updated'
  | ListToastVariant
  | BulkErrorToastVariant
  | BulkLimitToastVariant

/**
 * リストの知らせ 3 種(入れた・外した・失敗)。今のトーストの器に足した(新しい形のトーストを作らない)。
 * 失敗は店の保存の知らせの代わりにも出る(保存は通ったが、リストの入れ替えが通らなかった時)。
 */
export type ListToastVariant = 'list-added' | 'list-removed' | 'list-error'

/**
 * 一覧の「選ぶ」の一括の状態の変更・削除が失敗した時の知らせ。今のトーストの失敗の器に、既存の文
 * (`web.common.errorTryLater`)を入れる。「リストを変更できませんでした。」は状態・削除には事実と違うので使わない。
 */
export type BulkErrorToastVariant = 'bulk-error'

/**
 * 一覧の「選ぶ」で上限(`LIST_BULK_MAX`)まで選んだ後に、もう 1 件を押した時の知らせ。今のトーストの失敗の器(茜の円と「!」)に、
 * 文 `web.lists.bulkLimit`(尾は無し)を入れる。選びは変えない。単位 lists-filter-carry の受入条件 6。
 */
export type BulkLimitToastVariant = 'bulk-limit'
