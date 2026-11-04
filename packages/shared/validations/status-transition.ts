import type { SavedPlaceStatus } from '../constants/saved-place'

/**
 * 保存状態の遷移の判定(spec §6.2・§8)。web の Server Action(`runSavePlace`)と mobile の直接の update が同じ表を使う。
 * - `from` が null(新規)は全て可。
 * - 評価済み(`want_to_go` 以外)から未評価の `want_to_go` へ**戻す**遷移だけが不可。
 * DB の CHECK には置かない(アプリ層の権威)。値の文字列は DB enum の 3 値(生成物の `saved_place_status`)。
 */
export function isAllowedStatusChange(
  from: SavedPlaceStatus | null,
  to: SavedPlaceStatus,
): boolean {
  if (from === null) return true
  return !(from !== 'want_to_go' && to === 'want_to_go')
}
