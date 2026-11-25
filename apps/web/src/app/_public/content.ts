import packageJson from '../../../package.json'

export const APP_VERSION = packageJson.version
/** 問い合わせの窓口(規約第 15 条 2 項・プライバシーポリシー第 13 条 1 項)。2026-11-25 に X のダイレクトメッセージから替えた(harema#212)。 */
export const CONTACT_EMAIL = 'harema.app.support@gmail.com'
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`
/** 運営者の X(最新情報の発信。問い合わせの窓口ではない)。 */
export const OPERATOR_X_URL = 'https://x.com/htoranosuke'
