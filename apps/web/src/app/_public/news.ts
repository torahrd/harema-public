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
  /** 英語の更新情報(/en と /en/news)。題と文の数は日本語と同じ。日本語と同じ事実だけを書き、新機能と不具合の修正を書き分ける。英語の文には「/」の印を入れない(英語は語の間で折れる)。 */
  en: { title: string; texts: readonly string[] }
  /**
   * 適用の日時から差し替える文(任意)。`at`(UTC の ISO 文字列)以後は、`texts`・`en.texts` の代わりにこの文を出す
   * (掲示の件を、適用の後に「本文に反映しています」へ直す。0 時ちょうどに、デプロイなしで切り替わる)。
   * `at` はその改定の適用の日時(`LEGAL_REVISIONS` の行・DB の行と同じ瞬間。照合は legal-switch.test.mjs)。文の数は元と同じ。
   * 置き方の約束(相対 import を持たない)のため、`at` は値で書く。
   */
  after?: { at: string; texts: readonly string[]; en: { texts: readonly string[] } }
  /**
   * この件の文を、改定のお知らせ(地図・同意の取り直し)の枠に出す改定の適用の日(`YYYY.MM.DD`。DB の `notice_effective_on` と同じ。
   * 照合は legal-switch.test.mjs)。お知らせは適用の後にしか出ないので、枠には `after` の文が出る(`after` を必ず持つ)。
   * 同じ値を持つ件は 1 つだけ。
   */
  notice?: string
  /**
   * この日時(UTC の ISO 文字列)より前は、件を LP と /news に出さない(任意)。機能の門が開く日時と同じ瞬間に、
   * デプロイなしで件が出る(先に公開しておく web の公開で、0 時の前に件が見えないようにする)。
   */
  from?: string
}

/** 新しい順。 */
export const NEWS: readonly NewsItem[] = [
  // リストの門が開く 2026-11-29 0 時(JST)から出す(DB の agreement_state の lists_open と同じ瞬間)。
  { date: '2026.11.29', targets: ['Web', 'Android'], title: '機能の追加', from: '2026-11-28T15:00:00Z', texts: [
    '保存した店を/リストに分けられるようにしました。',
    'リストは 3 個まで、/名前は 15 文字までです。',
    '地図と保存した店の一覧で、/リストを選んで/絞り込めるようにしました。',
    '一覧で複数の店を選び、/まとめてリストに入れる・外す・/状態を変える・削除が/できるようにしました。',
  ],
    en: { title: 'New features', texts: [
      'You can now sort saved places into lists.',
      'You can have up to 3 lists, with names up to 15 characters.',
      'On the map and in the saved list, you can now choose a list to filter places.',
      'In the saved list, you can now select several places and add them to or remove them from a list, change their status or delete them at once.',
    ] } },
  { date: '2026.11.25', targets: ['Web', 'Android', 'iPhone'], title: 'プライバシーポリシーなどの改定', texts: [
    '2026.11.29/ 午前 0 時(日本標準時)から/プライバシーポリシーを改定します。',
    '保存した店をリストに/分けられるようにするため、/リストと、リストに入れた店を/保存する情報に追加します。',
    '改定の内容は/プライバシーポリシーのページの冒頭に/掲載しています。',
    '問い合わせの窓口を/X のダイレクトメッセージから/メールに変えました。',
  ],
    en: { title: 'Privacy Policy and Terms update', texts: [
      'The Privacy Policy will be revised from 0:00 a.m. on 2026.11.29 (Japan Standard Time).',
      'To let you sort saved places into lists, we are adding lists and the places in them to the information we store.',
      'The details of the revision are posted at the top of the Privacy Policy page.',
      'We changed the contact point for inquiries from X direct messages to email.',
    ] },
    // 改定のお知らせ(地図)の枠に出す件。値は 4 回目の改定の適用の日(DB の notice_effective_on)。
    notice: '2026.11.29',
    // 適用の日時(2026-11-29 0 時 JST)から、冒頭の掲示を外した本文に合わせて 3 つ目の文だけ直す(2026.11.16 の件と同じ形)。
    after: { at: '2026-11-28T15:00:00Z', texts: [
      '2026.11.29/ 午前 0 時(日本標準時)から/プライバシーポリシーを改定します。',
      '保存した店をリストに/分けられるようにするため、/リストと、リストに入れた店を/保存する情報に追加します。',
      '改定後の内容は/プライバシーポリシーの/本文に反映しています。',
      '問い合わせの窓口を/X のダイレクトメッセージから/メールに変えました。',
    ], en: { texts: [
      'The Privacy Policy will be revised from 0:00 a.m. on 2026.11.29 (Japan Standard Time).',
      'To let you sort saved places into lists, we are adding lists and the places in them to the information we store.',
      'The revised content is reflected in the body of the Privacy Policy.',
      'We changed the contact point for inquiries from X direct messages to email.',
    ] } } },
  { date: '2026.11.25', targets: ['iPhone'], title: 'バージョン 2.0.0 を公開', texts: [
    'iPhone の言語を英語にすると/アプリも英語で表示するようにしました。',
    'メニューに/言語の行を追加し/ iPhone の設定を開けるようにしました。',
    '利用規約やプライバシーポリシーを/改定したときに/お知らせを表示して/同意をお願いするようにしました。',
  ],
    en: { title: 'Version 2.0.0 released', texts: [
      'When your iPhone is set to English, the app is now shown in English.',
      'The menu now has a language row that lets you open your iPhone’s Settings.',
      'When the Terms of Use or the Privacy Policy is revised, the app now shows a notice and asks for your consent.',
    ] } },
  { date: '2026.11.22', targets: ['Web', 'Android'], title: '機能の追加', texts: [
    'アプリの表示を/英語に切り替えられるようにしました。',
    'トップページ・更新情報・利用規約・/プライバシーポリシーに/英語のページを追加しました。',
    '利用規約やプライバシーポリシーを/改定したときに、/改定のお知らせを表示して/同意をお願いするようにしました。',
  ],
    en: { title: 'New features', texts: [
      'You can now switch the app display to English.',
      'Added English pages for the top page, Updates, the Terms of Use and the Privacy Policy.',
      'When the Terms of Use or the Privacy Policy is revised, we now show a notice of the revision and ask for your agreement.',
    ] } },
  { date: '2026.11.22', targets: ['Web', 'Android', 'iPhone'], title: 'プライバシーポリシーの改定', texts: [
    '同意の記録と/言語の Cookie の説明を、/実際の取り扱いに合わせて/改めました。',
  ],
    en: { title: 'Privacy Policy update', texts: [
      'We revised the explanations of the record of agreement and the language cookie to match how they are actually handled.',
    ] } },
  { date: '2026.11.16', targets: ['Web', 'Android', 'iPhone'], title: 'プライバシーポリシーの改定', texts: [
    '2026.11.20 午前 0 時(日本標準時)から/プライバシーポリシーを改定します。',
    '表示する言語を選べるようにするため、/選んだ言語を保存する Cookie の説明を/追加します。',
    '同意を記録する項目に/利用規約の最終改定日を/追加します。',
    '改定後の内容は/プライバシーポリシーの/本文に反映しています。',
  ],
    en: { title: 'Privacy Policy update', texts: [
      'The Privacy Policy will be revised from 0:00 a.m. on 2026.11.20 (Japan Standard Time).',
      'To let you choose the language displayed, we are adding an explanation of the cookie that stores the language you choose.',
      'We are adding the last revised date of the Terms of Use to the items in the record of agreement.',
      'The revised content is reflected in the body of the Privacy Policy.',
    ] } },
  { date: '2026.11.14', targets: ['Web', 'Android'], title: '不具合の修正', texts: ['パソコンなどの広い画面で/更新情報の日付が/崩れる不具合を修正しました。'],
    en: { title: 'Bug fix', texts: ['Fixed a bug where the dates in Updates were misaligned on wide screens such as computers.'] } },
  { date: '2026.11.13', targets: ['iPhone'], title: 'バージョン 1.0.1 を公開', texts: [
    'Google マップと/一部のウェブサイトからの共有に/お店の名前の自動入力を追加しました。',
    '地図のピンから開いた画面に/営業時間などの表示を追加しました。',
    '出典の欄を押して/元のページを開く機能を追加しました。',
    'ログインが切れた場合に/画面を開けない不具合を修正しました。',
  ],
    en: { title: 'Version 1.0.1 released', texts: [
      'Added automatic entry of the place name when sharing from Google Maps and some websites.',
      'Added opening hours and other details to the screen opened from a map pin.',
      'Added the ability to tap the source field to open the original page.',
      'Fixed a bug where a screen could not be opened when your login had expired.',
    ] } },
  { date: '2026.11.12', targets: ['Web', 'Android'], title: '不具合の修正', texts: ['ページのタイトルを取得できない出典が/リンクにならない不具合を修正しました。'],
    en: { title: 'Bug fix', texts: ['Fixed a bug where a source whose page title could not be retrieved did not become a link.'] } },
  { date: '2026.11.11', targets: ['Web', 'Android'], title: '機能の追加', texts: [
    '地図のピンから開いた画面に/営業時間などの表示を追加しました。',
    '出典の欄を押して/元のページを開く機能を追加しました。',
    'トップページに/更新情報の欄を追加しました。',
  ],
    en: { title: 'New features', texts: [
      'Added opening hours and other details to the screen opened from a map pin.',
      'Added the ability to tap the source field to open the original page.',
      'Added an Updates section to the top page.',
    ] } },
  { date: '2026.11.11', targets: ['Android'], title: 'Android 向けの機能の追加', texts: [
    'ほかのアプリの共有から/お店を保存する機能を追加しました。',
    'Chrome の「ホーム画面に追加」から/アプリと同様に開く機能を追加しました。',
  ],
    en: { title: 'New features for Android', texts: [
      'Added the ability to save a place from the share menu of other apps.',
      'Added the ability to open hareMa like an app from Chrome’s “Add to Home screen”.',
    ] } },
  { date: '2026.11.07', targets: ['iPhone'], title: 'iPhone のアプリを公開', texts: ['App Store で/ iPhone のアプリを公開しました。'],
    en: { title: 'iPhone app released', texts: ['The iPhone app is now available on the App Store.'] } },
  { date: '2026.11.07', targets: ['Web', 'Android'], title: 'App Store へのリンク', texts: ['トップページに/ App Store へのリンクを追加しました。'],
    en: { title: 'Link to the App Store', texts: ['Added a link to the App Store on the top page.'] } },
  { date: '2026.11.05', targets: ['Web', 'Android'], title: '機能の追加と不具合の修正', texts: [
    '地図のピンを押して/編集の画面を開く機能を追加しました。',
    '地図の検索に/飲食店以外を含める機能を追加しました。',
    'メニューに/利用規約などのリンクを追加しました。',
    '地図を読み込めない場合に/エラーになる不具合を修正しました。',
    'ログイン済みでも/ログインを求める不具合を修正しました。',
  ],
    en: { title: 'New features and bug fixes', texts: [
      'Added the ability to tap a map pin to open the edit screen.',
      'Added the option to include places other than restaurants in map search.',
      'Added links such as the Terms of Use to the menu.',
      'Fixed a bug that caused an error when the map could not be loaded.',
      'Fixed a bug that asked you to log in even when you were already logged in.',
    ] } },
  { date: '2026.11.04', targets: ['Web', 'Android'], title: 'ブラウザ版を公開', texts: [
    'harema.app で/ブラウザ版を公開しました。',
    'ログインの画面で/同意のチェックを 1 つにまとめました。',
  ],
    en: { title: 'Web version released', texts: [
      'The web version is now available at harema.app.',
      'Combined the consent checkboxes on the login screen into one.',
    ] } },
]

/**
 * 件の題と文を言語で選ぶ(日本語は件の `title`・`texts`、英語は `en`)。`after` を持つ件は、`now`(`Date.now()` の値)が `after.at` 以後なら
 * `after` の文を出す(`>=`。適用の瞬間から)。呼ぶ側は `await connection()` の後に `Date.now()` を渡す(静的な頁では固まる)。
 */
export function newsText(item: NewsItem, locale: 'ja' | 'en', now: number): { title: string; texts: readonly string[] } {
  const switched = item.after !== undefined && now >= Date.parse(item.after.at)
  if (locale === 'en') return { title: item.en.title, texts: switched && item.after ? item.after.en.texts : item.en.texts }
  return { title: item.title, texts: switched && item.after ? item.after.texts : item.texts }
}

/** `now`(`Date.now()` の値)の時点で出す件(`from` が先の件を除く。`>=`。呼ぶ側は `await connection()` の後に渡す)。 */
export function visibleNews(now: number): readonly NewsItem[] {
  return NEWS.filter((item) => item.from === undefined || now >= Date.parse(item.from))
}

/** 改定のお知らせの枠に出す件(`notice` が適用の日と同じ件)。無ければ null(枠を出さない)。 */
export function noticeNewsItem(effectiveOn: string): NewsItem | null {
  return NEWS.find((item) => item.notice === effectiveOn) ?? null
}

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
