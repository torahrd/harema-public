import { en } from './en'
import { ja } from './ja'
import type { Locale } from './locale'

export { en, ja }
export { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, localeSchema, matchLocale, parseAcceptLanguage } from './locale'
export type { Locale } from './locale'
export { legalPath } from './legal-path'
export type { LegalName, LegalPath } from './legal-path'

/** メッセージ辞書の型構造。全ロケールが ja と同型(`satisfies Messages`)。 */
export type Messages = typeof ja

/** 言語ごとの辞書。web の next-intl の設定(apps/web/src/i18n/request.ts)がこれを引く。 */
export const messages: Record<Locale, Messages> = { ja, en }
