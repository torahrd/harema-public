import type { SavedPlaceStatus } from '@harema/shared/constants'

/**
 * S1(保存/編集シート)の逐語文言。文言は §5 STOP の対象なので実装側では決めない —— ここに
 * 集めてあるのは確定済みの逐語で、変更は裁定を経る。出所は design C-1 / C-2、または裁定。
 *
 * - SAVE_SUCCESS_TOAST … 新規 / 更新で分けるのは、CTA が「保存する →」/「更新する →」で
 *   分かれているのに対応させるため。造形は spec §7 の「素のチェック ✓ + --accent」で、器と
 *   定位置は既存 map-toast.tsx を再利用する。
 * - SOURCE_TITLE_UNREADABLE … design C-1 のヘルパ行と同じ 1 行(11px / --fg-2)で出す。
 *   保存自体は妨げないことまで言い切る —— 沈黙させると、貼った URL が無効だったのかと迷わせる
 *   (同一 URL の再取得は抑止されるので、もう一度 blur しても何も起きない)。
 * - SAVE_FAILED … design はシート内の失敗表示を定義しないため、WP-06 が同じ理由で置いた汎用
 *   失敗文言(onboarding の ACTION_ERROR)を逐語で流用する。新しい文言を作らない。
 */

export const SAVE_SUCCESS_TOAST: Record<'created' | 'updated', string> = {
  created: '保存しました。',
  updated: '更新しました。',
}

export const SOURCE_TITLE_UNREADABLE =
  'タイトルは読み取れませんでしたが、このまま保存できます。'

export const SAVE_FAILED = 'うまくいきませんでした。もう一度お試しください。'

/** セグメントの 3 状態(design C-1 41〜43 行)。並びは DB enum の順そのまま。 */
export const STATUS_LABELS: Record<SavedPlaceStatus, string> = {
  want_to_go: '行きたい',
  visit_again: 'また行きたい',
  no_thanks: 'もういい',
}

/** 評価済みの店を編集しているときだけ出す注記(design C-2 101 行)。 */
export const STATUS_REVERT_NOTE = '評価済みから「行きたい」へは戻せません。'

/** 見出しラベル(design C-1 39 / 45 / 47 行)。「状態」は C-1 にだけあり C-2 には無い。 */
export const STATUS_LABEL = '状態'
export const MEMO_LABEL = 'メモ'
export const SOURCE_LABEL = '出典'

/** 入力のプレースホルダ(design C-1 46 / 48 行)。 */
export const MEMO_PLACEHOLDER = '気になったこと、行きたい理由など（任意）'
export const SOURCE_PLACEHOLDER = 'URL またはテキスト（任意）'

/** 出典欄のヘルパ行(design C-1 49 行)。chip も失敗行も無いときに出す。 */
export const SOURCE_HELPER = 'URL を貼ると、タイトルを自動で読み取ります（OGP）。'

/** 主 CTA(design C-1 50 行 / C-2 111 行)。新規 = 保存、編集 = 更新。 */
export const CTA_LABELS: Record<'create' | 'edit', string> = {
  create: '保存する',
  edit: '更新する',
}

/**
 * D5(削除確認ダイアログ・design C-3 = WP-08-save-detail-flow.html、面 6 = WP-10-place-detail.html
 * の店名なし版)。見出しとボタンは C-3 のままで不変、本文だけ店名の有無で分かれる。
 * 出所は計画 §8.2 の確定 copy 表(逐語)。
 */
export const DELETE_CONFIRM_TITLE = '削除しますか？'

/**
 * D5 本文。鉤括弧「」は店名を差し込む文字列の一部であって装飾ではないので、差し替えるのは
 * 店名だけ。店名が空の POI(面 6)では鉤括弧を含む文そのものを出さない。
 */
export function deleteConfirmBody(displayName: string): string {
  return displayName.length > 0
    ? `「${displayName}」を、保存した店から削除します。メモ・状態・出典も消え、元に戻せません。`
    : 'この店を、保存した店から削除します。メモ・状態・出典も消え、元に戻せません。'
}

export const DELETE_CONFIRM_CANCEL = 'キャンセル'

/** D5 の確定ボタンと、S1 下固定の削除トリガーが共有する逐語(同一動詞・同一文字列)。 */
export const DELETE_LABEL = '削除する'
