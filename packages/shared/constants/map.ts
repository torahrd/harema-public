/** Autocomplete 入力のデバウンス。連続入力のたびに API を叩かないための待ち時間(ms)。 */
export const SEARCH_DEBOUNCE_MS = 300

/** Autocomplete を発火させる最小文字数(コードポイント)。下の漢字例外を除いてこれ未満は送らない。 */
export const SEARCH_MIN_LENGTH = 2

/**
 * 漢字 1 文字。CJK 統合漢字の基本ブロック(U+4E00–U+9FFF)に加えて、拡張 A(U+3400–U+4DBF)・
 * 互換漢字(U+F900–U+FAFF)・SIP の拡張 B 以降と互換補助(U+20000–U+2FA1F)を含める ——
 * 「山﨑」の﨑(U+FA11)や「𠮷野家」の𠮷(U+20BB7)のように、拡張側にしか無い字で始まる店名が
 * 実在するため。プレーン 3 の拡張 G / H は日本語の店名に現れないので入れない。
 */
const KANJI_PATTERN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2FA1F}]/u

/**
 * 検索を発火させてよい入力か(ユーザー承認, 2026-08-07)。**2 文字以上、または漢字を含むなら
 * 1 文字でも発火**し、止まるのはかな・英数・記号の 1 文字だけ。
 *
 * 単漢字の店名(「凪」等)は変換確定後に 1 文字になるが、漢字 1 文字は読み 2〜3 かな分の情報量を
 * 持つので候補が絞れる。読みで探す場合はかな 2 文字(「なぎ」)になり、例外を通さずとも発火する。
 *
 * 長さはコードポイントで数える(サロゲートペアの漢字を 2 と数えない)。`codePointLength` は
 * validations 側にあるが、依存の向きが validations → constants なので参照しない。
 */
export function meetsSearchMinLength(input: string): boolean {
  return [...input].length >= SEARCH_MIN_LENGTH || KANJI_PATTERN.test(input)
}

/**
 * 既定エリア = 東京駅。位置情報が拒否された / 取得に失敗したときの地図中心。
 * (許可時は現在地へパンする。ユーザー承認, 2026-07-20)
 */
export const DEFAULT_MAP_CENTER = { lat: 35.6812, lng: 139.7671 } as const

/** 既定ズーム(既定エリア表示時。ユーザー承認, 2026-07-20)。 */
export const DEFAULT_MAP_ZOOM = 14
