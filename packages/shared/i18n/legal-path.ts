import type { Locale } from './locale'

/** 規約・ポリシーの頁の名前。 */
export type LegalName = 'terms' | 'privacy'

const LEGAL_PATHS = {
  ja: { terms: '/terms', privacy: '/privacy' },
  en: { terms: '/en/terms', privacy: '/en/privacy' },
} as const satisfies Record<Locale, Record<LegalName, string>>

/** 規約・ポリシーの頁の道(定数の 4 つのどれか)。 */
export type LegalPath = (typeof LEGAL_PATHS)[Locale][LegalName]

/**
 * 規約とポリシーの行き先の唯一の決め手(web のログイン・メニューと iOS のログイン・メニューの 6 か所がこれだけを使う)。
 * 言語ごとの頁へ向ける。返すのは上の定数だけで、入力の文字列は混ぜない(外のサイトへ飛ばす道を作らない)。
 */
export function legalPath(locale: Locale, name: LegalName): LegalPath {
  return LEGAL_PATHS[locale][name]
}
