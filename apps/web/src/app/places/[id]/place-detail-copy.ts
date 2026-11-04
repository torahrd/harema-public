/**
 * 店舗詳細(④)の逐語文言の 1 箇所化(計画 §7.1)。ここに置くのは design の当該コマに
 * そのまま実在する語(見出し・キャプション・ボタンラベル・矢印記号)と、計画 §8.2 が
 * 確定させた 2 文(取得失敗時)だけで、新しい文言は 1 つも作らない。
 *
 * 状態ラベル 3 種の逐語はここに置かない —— 辞書(`@harema/shared/i18n` の
 * `ja.savedPlaceStatus`)が正で、そこから取る(C-S7)。
 */

/** 戻る(←)の読み上げ名。可視文言ではないが、行き先の呼び名は一覧の戻る導線と同じ作法で揃える。 */
export const DETAIL_BACK_LABEL = '一覧へ戻る'

/** 状態行のキャプション(design `.sd-cap`)。 */
export const DETAIL_STATUS_CAPTION = '状態'

/** メモ節のキャプション(design `.sd-cap2`)。 */
export const DETAIL_MEMO_CAPTION = 'メモ'

/** 出典節のキャプション(design `.sd-cap2`)。 */
export const DETAIL_SOURCE_CAPTION = '出典'

/** 展開行のラベル(design `.sd-disc`)。全角括弧はそのまま写す。 */
export const DETAIL_ROW_LABEL = '詳細情報（営業時間・電話・website）'

/** 編集導線のラベルと矢印(design `.sd-edit` / `.btn-hairline .arrow`)。 */
export const DETAIL_EDIT_LABEL = '編集する'
export const DETAIL_EDIT_ARROW = '→'

/** Google マップ外部リンクのラベル(design `.sd-full`)。 */
export const DETAIL_MAPS_LABEL = 'Google マップで開く'

/** 出典・Google マップの外部リンクに添える矢印(design 逐語。両者で同一の記号)。 */
export const EXTERNAL_ARROW = '↗'

/**
 * 店名・住所の取得失敗(面 1b)。計画 §8.2 の確定 copy(出所:design
 * `WP-10-place-detail.html:156` `.sd-fail` / `.sd-fail2`)。
 */
// 「いま、」を外し(所有者 2026-10-23・11-04)、「この」を除いて 1 行に入る長さにした(402px で 1 行)。
export const DETAIL_FETCH_FAIL_LINE_1 = ['店の名前と住所を読み込めませんでした。'] as const
export const DETAIL_FETCH_FAIL_LINE_2 = '少し待って、もう一度開いてください。'

/** 展開パネルの見出し(design `.sd-pcap`、面 3/4/5/9 に逐語で実在)。 */
export const DETAIL_PANEL_HOURS_CAPTION = '営業時間'
export const DETAIL_PANEL_PHONE_CAPTION = '電話'
export const DETAIL_PANEL_WEBSITE_CAPTION = 'website'

/** 展開パネルの「値が無い」プレースホルダ(design `.sd-nil` の逐語。面 3/4)。 */
export const DETAIL_PANEL_MISSING = '—'

/**
 * Enterprise 取得(展開時)が reject したときの 1 文。design にこのコマは無い
 * (`WP-10-coordinator-handoff.md` U5)。文言そのものは 2026-08-24 の確定事項で、
 * 骨格の出所は `specification.md`(検索失敗トーストの「〜ませんでした。」。「いま、」は付けない)。
 * 値欄の `DETAIL_PANEL_MISSING`(情報が無い)とは別の意味なので混同しない。
 */
export const DETAIL_ENTERPRISE_FETCH_FAIL = '詳細情報を読み込めませんでした。'
