/**
 * 配列の文言(1 行 1 文・句の並びなど、折る位置を文言の側が持つ所)を読む。
 * `t.raw(key)` は ICU の書式を通さない生の値を返す。配列でない・文字列でない物が来たら落とす(辞書の形の誤りを黙らせない)。
 */
export function asLines(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((x): x is string => typeof x === 'string')) {
    throw new Error('i18n: 文字列の配列を期待した')
  }
  return raw
}

/** 句の並びの並び(注釈の項目ごとの句)。 */
export function asLineGroups(raw: unknown): string[][] {
  if (!Array.isArray(raw)) throw new Error('i18n: 配列の配列を期待した')
  return raw.map(asLines)
}
