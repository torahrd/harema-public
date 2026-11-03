/**
 * 地図の器の下端の最小の余白(px)。下端の 12px は .edge-tint(globals.css・Safari のバーの色を
 * 外観に追従させる、描かれる帯)が塗るので、地図をその上で終え、Google のロゴと帰属の行を
 * 帯の下に隠さない。
 */
export const MAP_EDGE_INSET = 12

/**
 * 保存シートが地図を覆う高さ(px)。地図の器の `bottom` に入れる値。
 * 純関数(import なし)。node の type stripping でテストから直接読む。
 *
 * - sheetTop が有限でない、または器の下端以下(シートが画面の外)なら MAP_EDGE_INSET(全画面)。
 * - それ以外は containerHeight - max(0, sheetTop)(MAP_EDGE_INSET を下回らない)。丸めない。
 *   ほかの下限は持たない(キーボードで器が潰れても受け入れる。下限を持つとロゴがシートに隠れる)。
 */
export function sheetCoverInset(sheetTop: number, containerHeight: number): number {
  if (!Number.isFinite(sheetTop) || sheetTop >= containerHeight) return MAP_EDGE_INSET
  return Math.max(MAP_EDGE_INSET, containerHeight - Math.max(0, sheetTop))
}

/**
 * 動きの間に器へ書く値。シートが下へ動いている(閉じる・キーボードが引く)間は MAP_EDGE_INSET(全画面)にする。
 * 器の下端の書き込みはシートの動きに 1 フレーム遅れるので、下へ動く間に追うと、
 * 地図とシートの間に無地の帯が出る(2026-11-02 の実地図の目視で、負荷なしで 6px・負荷ありで 57px)。
 * 全画面にすれば帯は出ず、動きの間だけロゴが去っていくシートの下に入る。動きが終わったフレームでは
 * animating = false で呼び、sheetCoverInset のとおりの値に戻す。上へ動く(開く)間の遅れは、
 * 器がシートの下に余るだけで帯にならないので、そのまま追う。
 */
export function sheetFollowInset(
  sheetTop: number,
  containerHeight: number,
  previousTop: number,
  animating: boolean,
): number {
  if (animating && Number.isFinite(previousTop) && sheetTop > previousTop) return MAP_EDGE_INSET
  return sheetCoverInset(sheetTop, containerHeight)
}
