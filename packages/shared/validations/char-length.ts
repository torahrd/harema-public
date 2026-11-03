/**
 * Unicode コードポイント数を返す。
 *
 * `String.prototype.length` は UTF-16 コードユニット単位で数えるため、サロゲートペア
 * (絵文字など)を 2 と数えて DB の `char_length`(コードポイント基準)と食い違う。
 * 文字数上限の Zod は DB CHECK と一致させる必要があるため、長さ判定はここに集約する
 * (`.max(<数値>)` を直接使わない)。
 */
export function codePointLength(value: string): number {
  return [...value].length
}
