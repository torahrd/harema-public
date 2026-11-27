/**
 * 文字数上限。DB CHECK(schema-contract.md §2.2 / §2.5)と鏡像で、アプリ層 Zod の
 * 二重チェック(spec §8)に使う。基準は char_length(コードポイント)。
 */
export const USERNAME_MIN_LENGTH = 1
export const USERNAME_MAX_LENGTH = 15
export const MEMO_MAX_LENGTH = 500
export const SOURCE_TEXT_MAX_LENGTH = 1000
export const SOURCE_TITLE_MAX_LENGTH = 200

/**
 * google_place_id の上限だけは DB CHECK に対応物が無い(places.google_place_id は text unique)。
 * クライアントから来る唯一の外部 ID を無制限に受けないための防御的上限で、Google の Place ID
 * (実測 27〜200 文字台)に対して十分な余裕を取った値。
 */
export const GOOGLE_PLACE_ID_MAX_LENGTH = 512

/**
 * 共有(他のアプリの「共有」)から検索欄に入れる文字の上限(コードポイント)。長い本文をそのまま検索に投げない。
 * 共有の中身の受け渡しの検証(`validations/share-handoff.ts`)と、共有の文の解析(mobile の `parse-shared.ts`)が
 * 同じ値を使う。
 */
export const SHARE_QUERY_MAX_LENGTH = 60

/**
 * リスト(`public.lists` / `public.list_places`・段 2a)の上限。
 * 名前とアイコンの長さは DB CHECK(`char_length(name) between 1 and 15`・`char_length(icon) between 1 and 32`)の鏡像。
 * 名前の上限は**所有者の決定(2026-11-26 00:56 JST・harema#152)**。22 本目は 30 で置き、28 本目(`20261128000001_list_name_15.sql`)が 15 に置き換えた。変えるときは新しい migration で制約を替え、この値と ja/en の説明の文も合わせる。
 * リストの数の上限(`LIST_MAX_PER_USER`)は**所有者の決定(2026-11-26 00:04 JST・harema#152。11-29 の公開の値。有料の段の数は料金の段と一緒に決める)**。DB のトリガー
 * (`private.enforce_list_limit`・SQLSTATE 54000)が同じ値を持つ。変えるときは新しい migration で関数を置き換え、この値も合わせる。
 */
export const LIST_NAME_MAX_LENGTH = 15
export const LIST_ICON_MAX_LENGTH = 32
export const LIST_MAX_PER_USER = 3

/**
 * 一覧の「選ぶ」と一括の出し入れで 1 回に扱う店の数の上限。**仮の上限(所有者の決定ではない)**。
 * 1 回の送信を限り、URL と応答を大きくしすぎないための値。
 */
export const LIST_BULK_MAX = 100
