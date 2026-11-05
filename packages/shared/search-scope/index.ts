/**
 * 検索の範囲(「飲食店以外を検索結果に含める」のスイッチ)の純粋な関数。
 * web と mobile の候補の枠が同じ並び・同じ出し分けを使う(react・Google の型は import しない)。
 * 出どころ: 所有者の決定 2026-11-05(UNIT.md 02:49 見出しなしで Google の順・02:50 文言)。
 */

export type SuggestionBucket = 'food' | 'location'

/**
 * 描く行の順。`store`(スイッチがオフ)は飲食だけ、`map`(オン)は飲食と場所を合わせて、
 * どちらも Google が返した順(`rank` の昇順)。見出しは無い。bucket は選んだ時の動きと注記に使う。
 */
export function suggestionRows<T extends { rank: number }>(
  mode: 'store' | 'map',
  groups: { food: readonly T[]; location: readonly T[] },
): { item: T; bucket: SuggestionBucket }[] {
  const rows: { item: T; bucket: SuggestionBucket }[] = groups.food.map((item) => ({
    item,
    bucket: 'food' as const,
  }))
  if (mode === 'map') {
    for (const item of groups.location) rows.push({ item, bucket: 'location' })
  }
  return rows.sort((a, b) => a.item.rank - b.item.rank)
}

/**
 * 候補の枠に何を描くか。行があれば 'rows'。行が 0 件でもスイッチがあれば 'switch-only'
 * (オフで地名を打つと飲食が 0 件になり、枠ごと消すとスイッチに辿り着けないため)。
 */
export function panelContent(input: {
  hasSwitch: boolean
  rowCount: number
}): 'none' | 'switch-only' | 'rows' {
  if (input.rowCount > 0) return 'rows'
  return input.hasSwitch ? 'switch-only' : 'none'
}
