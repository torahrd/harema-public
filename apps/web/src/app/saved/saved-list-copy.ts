/**
 * 一覧(⑤)の逐語文言。文言は §5 STOP の対象なので実装側では決めない —— ここに集めてあるのは
 * 確定済みの逐語で、変更は裁定を経る。出所は design D-3 / D-4、または裁定。
 *
 * 1 箇所化する理由は save-sheet-copy.ts / error-copy.ts と同じ —— TSX へ直書きすると、片方だけ
 * 直された瞬間に「同じことの 2 つの言い方」が本番に並ぶ。
 *
 * 3 タブの状態ラベルはここに置かない。辞書(`@harema/shared/i18n` の `ja.savedPlaceStatus`)が
 * 正で、そこから取る。
 */

/** ヘッダのタイトル(design D-3)。 */
export const SAVED_LIST_TITLE = '保存した店'

/** 戻る(←)の読み上げ名。可視文言ではないが、行き先の呼び名は 404 面の CTA と揃える。 */
export const BACK_TO_MAP_LABEL = '地図へ戻る'

/** 空のタブ(design D-4)。3 タブ共通の統一文言で、CTA もイラストも置かない。 */
export const SAVED_LIST_EMPTY = '保存した店は、まだありません。'

/**
 * 表示用 Place Details が取れなかった行に、店名の位置へ出す 1 行(ユーザー裁定 2026-08-12)。
 * 住所の位置には何も出さない。行は落とさない —— 件数バッジは DB の真値なので、落とすと
 * バッジと行数が食い違う。
 */
export const PLACE_DETAILS_UNAVAILABLE = '店舗の情報を読み込めませんでした。'
