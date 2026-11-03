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
