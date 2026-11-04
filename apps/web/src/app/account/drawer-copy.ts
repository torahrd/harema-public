/**
 * WP-11 アカウント管理(右ドロワー E-0 / E-0b・E-1 ユーザー名変更・E-4 退会確認)の逐語。
 * 一次ソース = claude.ai/design `hareMa アカウントフロー.dc.html`(etag `1785977989176170`)。
 * 文言はここ 1 箇所で読み、各コンポーネントは import して使う(save-sheet-copy.ts と同型)。
 * E-2 / E-3(メール変更・認証待ち)は撤去した(login-replace PLAN §0.3)。退会・ログアウトの失敗の文言と本人の確認の文は FREEZE(compare-v3)のとおり。
 */

// E-0 ヘッダ(`.caption-lead` の motif + caps-wide)。✕ は置かない(シートと同じ作法)。
export const DRAWER_HEADER = 'MENU'
export const DRAWER_ARIA_LABEL = 'メニュー'

// E-0 項目(順序確定・login-replace PLAN §0.3 の spec:232)。保存した店 → ユーザー名変更 → 退会 → ログアウト。
export const ITEM_SAVED = '保存した店'
export const ITEM_USERNAME = 'ユーザー名変更'
export const ITEM_WITHDRAW = '退会'
export const ITEM_LOGOUT = 'ログアウト'

// 退会の直前に置く予告(ink の太字 11px + vermilion の 16×2 の棒・Quiet Signal)。E-4 の予告と同じ文言・同じ型。
export const IRREVERSIBLE_NOTICE = '取り消せません'

// E-1 ユーザー名変更ダイアログ。
export const USERNAME_DIALOG_TITLE = 'ユーザー名変更'
export const CURRENT_LABEL = '現在'
export const USERNAME_NEW_LABEL = '新しいユーザー名'
export const USERNAME_PLACEHOLDER = '1〜15 文字'
export const USERNAME_SUBMIT = '更新する'

// E-4 退会確認ダイアログ(eyebrow は IRREVERSIBLE_NOTICE)。login-replace の FREEZE(compare-v3 の ③)で、
// 本文は意味の切れ目で 3 行に固定し、本人の確認(ログインに使った Apple / Google のボタン)を 1 文で案内する。
export const WITHDRAW_DIALOG_TITLE = '退会しますか？'
export const WITHDRAW_DIALOG_BODY_LINES = [
  'アカウントを削除します。',
  '保存した店・メモ・履歴は、すべて消え、元に戻せません。',
] as const

/**
 * 本人の確認の 1 文(2 行)。「ログインに使っている Google のアカウントで確認すると、そのまま退会します。」
 * (Apple でログインした人は Apple)。事業者が分からない(ID トークンに載っていない)ときは名を省く。
 */
export function withdrawReauthText(provider: 'google' | 'apple' | null): string {
  if (provider === null) return 'ログインしたアカウントで、確認すると、そのまま退会します。'
  const name = provider === 'apple' ? 'Apple' : 'Google'
  return `ログインした ${name} で、確認すると、そのまま退会します。`
}

// 退会の失敗(印を書けず何も消えていない = やり直せる・ボタンの下に 1 つだけ)。ログアウトの失敗は別の文。
export const WITHDRAW_ERROR = ['エラーが発生しました。', '少し待って、もう一度お試しください。'] as const
// ログアウトの失敗(compare-v3 の ④。ログアウトの下に出す)。
export const LOGOUT_ERROR = ['ログアウトできませんでした。', '少し待って、もう一度お試しください。'] as const

// 両ダイアログ共通の副ボタン。
export const DIALOG_CANCEL = 'キャンセル'

// ユーザー名変更の失敗パス(FREEZE の対象外 = 今のまま)。Onboarding(onboarding-form.tsx の
// ACTION_ERROR)と同じ既存文言を控えめな茜一行で示す。
export const ACTION_ERROR = 'うまくいきませんでした。もう一度お試しください。'

// 不可視・制御・方向制御文字を検出したときだけ出す(onboarding-form.tsx の INVISIBLE_CHAR_ERROR と
// 同じ design M1 の逐語。文ごとに 1 ブロック)。
export const INVISIBLE_CHAR_ERROR = [
  '見えない文字（制御文字）が含まれています。',
  '除いて、もう一度お試しください。',
] as const
