/**
 * 更新情報(LP の最新 3 件と /news の一覧)の 1 件のデータ。件の文はここの 1 か所だけ(LP と /news はここから読む)。
 * 運用: 使う人に見える変更を公開したら、`NEWS` の先頭に 1 件足す(docs/release-runbook.md R7「更新情報」)。
 * 置き方の約束: 相対 import・`@/`・`server-only` を持たない(node の検査から直接読む)。
 */
/** 対象の札。Android = Android の Chrome で使う web 版 */
export type NewsTarget = 'Web' | 'iPhone' | 'Android'

export type NewsItem = {
  /** JST の公開日 `YYYY.MM.DD` */
  date: string
  /** 札。web の変更は ['Web', 'Android']、iPhone のアプリの変更は ['iPhone']、Android の Chrome だけの変更は ['Android'](所有者 2026-11-12) */
  targets: readonly NewsTarget[]
  /** 太字の 1 行(機能の名前) */
  title: string
  /** 説明の文(1 文ずつ)。2 文以上は箇条書きで出る(所有者 2026-11-12「複数内容なら箇条書きにすべき」)。同じ日・同じ対象の組の変更は 1 件にまとめる(所有者 2026-11-12)。「/」は折ってよい位置の印(画面には出ない)。行を折るための「、」は入れない(所有者 2026-11-12「句読点がおかしい」) */
  texts: readonly string[]
}

/** 新しい順。 */
export const NEWS: readonly NewsItem[] = [
  { date: '2026.11.13', targets: ['iPhone'], title: 'バージョン 1.0.1 を公開', texts: [
    'Google マップと/一部のウェブサイトからの共有に/お店の名前の自動入力を追加しました。',
    '地図のピンから開いた画面に/営業時間などの表示を追加しました。',
    '出典の欄を押して/元のページを開く機能を追加しました。',
    'ログインが切れた場合に/画面を開けない不具合を修正しました。',
  ] },
  { date: '2026.11.12', targets: ['Web', 'Android'], title: '不具合の修正', texts: ['ページのタイトルを取得できない出典が/リンクにならない不具合を修正しました。'] },
  { date: '2026.11.11', targets: ['Web', 'Android'], title: '機能の追加', texts: [
    '地図のピンから開いた画面に/営業時間などの表示を追加しました。',
    '出典の欄を押して/元のページを開く機能を追加しました。',
    'トップページに/更新情報の欄を追加しました。',
  ] },
  { date: '2026.11.11', targets: ['Android'], title: 'Android 向けの機能の追加', texts: [
    'ほかのアプリの共有から/お店を保存する機能を追加しました。',
    'Chrome の「ホーム画面に追加」から/アプリと同様に開く機能を追加しました。',
  ] },
  { date: '2026.11.07', targets: ['iPhone'], title: 'iPhone のアプリを公開', texts: ['App Store で/ iPhone のアプリを公開しました。'] },
  { date: '2026.11.07', targets: ['Web', 'Android'], title: 'App Store へのリンク', texts: ['トップページに/ App Store へのリンクを追加しました。'] },
  { date: '2026.11.05', targets: ['Web', 'Android'], title: '機能の追加と不具合の修正', texts: [
    '地図のピンを押して/編集の画面を開く機能を追加しました。',
    '地図の検索に/飲食店以外を含める機能を追加しました。',
    'メニューに/利用規約などのリンクを追加しました。',
    '地図を読み込めない場合に/エラーになる不具合を修正しました。',
    'ログイン済みでも/ログインを求める不具合を修正しました。',
  ] },
  { date: '2026.11.04', targets: ['Web', 'Android'], title: 'ブラウザ版を公開', texts: [
    'harema.app で/ブラウザ版を公開しました。',
    'ログインの画面で/同意のチェックを 1 つにまとめました。',
  ] },
]

/** LP に出す件数(先頭から)。 */
export const LP_NEWS_COUNT = 3

/** 説明の文を、折ってよい位置の印「/」で句に切る(印は画面に出ない。句の中では折らない)。 */
export function newsPhrases(text: string): string[] {
  return text.split('/')
}

/** 印「/」を除いた、画面に出る文。 */
export function newsPlain(text: string): string {
  return text.replaceAll('/', '')
}

/** `YYYY.MM.DD` → `YYYY-MM-DD`(`<time dateTime>` 用)。 */
export function newsDateTime(date: string): string {
  return date.replaceAll('.', '-')
}
