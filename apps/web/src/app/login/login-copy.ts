/**
 * /login の文言(login-replace・FREEZE compare-v3 の「新」)。
 * ログインの失敗の表示は FREEZE の artboard に無い。所有者の答え(owner-verbatim-7.md:20「2 退会と同じ型」)により、
 * ③ 退会の失敗と同じ文と型(× + 2 文・1 文 1 行)。
 */
/** 見出し(所有者 2026-11-04)。1 行で、折りの細工はしない(web は nowrap の span 1 つ)。 */
export const LOGIN_HEADING = 'ログイン・登録'

/** リードの句の並び。web は句ごとに nowrap の span + `<wbr>`、mobile は句ごとの Text を折り返す row に並べる。折りは固定しない。 */
export const LOGIN_LEDE = 'Apple か Google のアカウントで続けます。'

/** 2 つ目の同意。句読点の後だけで折る(所有者 2026-11-04)。 */
export const CONSENT_FOREIGN = '海外の事業者への、個人情報の提供に同意する。(プライバシーポリシー第 7 条)'

export const LOGIN_ERROR = ['エラーが発生しました。', '少し待って、もう一度お試しください。'] as const

/**
 * 同意の 2 つのすぐ下の注釈(2 項目・案 B・所有者 2026-11-04)。1 項目 = 句の並び。
 * web は句ごとに nowrap の span + `<wbr>`、mobile は句をつなげた 1 文で描く。※ は描画側が頭に置く。
 */
export const LOGIN_NOTES = [
  ['はじめての方も、', 'ここから登録できます。'],
  ['登録の有無は', 'ログインの後に分かるため、', '登録済みの方も、', 'ログインのたびに', '同意が要ります。'],
] as const
