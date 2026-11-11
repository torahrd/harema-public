/**
 * 更新情報(LP の最新 3 件と /news の一覧)の 1 件のデータ。件の文はここの 1 か所だけ(LP と /news はここから読む)。
 * 運用: 使う人に見える変更を公開したら、`NEWS` の先頭に 1 件足す(docs/release-runbook.md R7「更新情報」)。
 * 置き方の約束: 相対 import・`@/`・`server-only` を持たない(node の検査から直接読む)。
 */
export type NewsItem = {
  /** JST の公開日 `YYYY.MM.DD` */
  date: string
  target: 'Web' | 'iPhone'
  /** 太字の 1 行(機能の名前) */
  title: string
  /** 説明の 1 文。句の切れ目は「、」の後だけ */
  text: string
}

/** 新しい順。 */
export const NEWS: readonly NewsItem[] = [
  { date: '2026.11.07', target: 'iPhone', title: 'iPhone のアプリを公開', text: 'ほかのアプリの共有から、切り替えずに保存できます。' },
  { date: '2026.11.05', target: 'Web', title: '地図のピンから編集', text: 'ピンを押すと編集のシートが開き、お店の詳細は一覧から開けます。' },
  { date: '2026.11.05', target: 'Web', title: '飲食店以外を検索結果に含める', text: '地図の検索中だけ、候補の上に出るスイッチです。' },
  { date: '2026.11.04', target: 'Web', title: 'ブラウザ版を公開', text: 'harema.app で、ブラウザのまま始められます。' },
]

/** LP に出す件数(先頭から)。 */
export const LP_NEWS_COUNT = 3

/** 説明の文を「、」の後で句に切る(句の中では折らない)。 */
export function newsPhrases(text: string): string[] {
  return text.split(/(?<=、)/)
}

/** `YYYY.MM.DD` → `YYYY-MM-DD`(`<time dateTime>` 用)。 */
export function newsDateTime(date: string): string {
  return date.replaceAll('.', '-')
}
