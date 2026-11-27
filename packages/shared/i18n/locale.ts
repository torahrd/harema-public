import { z } from 'zod'

/** 表示言語の値。サーバもクライアントもこの 1 か所だけを使う。 */
export const LOCALES = ['ja', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ja'

export const localeSchema = z.enum(LOCALES)

/**
 * 言語の自称。訳ではなく、どの言語の画面でも同じ字で出すので辞書に入れない(辞書の en に日本語の字が入るため)。
 * 切り替えの部品が、相手の言語の名前にも `lang` を付けて出す。
 */
export const LOCALE_NAMES: Record<Locale, string> = { ja: '日本語', en: 'English' }

// Accept-Language の先頭から読む長さの上限。
const MAX_HEADER_LENGTH = 1000

// 主の言語が英字 2〜3 字で、続く部分は英数字だけ(`en`・`en-US`・`zh-Hant-TW`)。
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i

/**
 * Accept-Language を、q 値の大きい順(同じ q は書かれた順)の言語タグの並びにする。
 * q=0・`*`・形が合わない物は捨てる。タグは小文字にして返す。null と空文字は空の並び。
 */
export function parseAcceptLanguage(header: string | null): string[] {
  if (header === null || header === '') return []
  const entries: { tag: string; q: number; index: number }[] = []
  header
    .slice(0, MAX_HEADER_LENGTH)
    .split(',')
    .forEach((part, index) => {
      const [rawTag = '', ...params] = part.split(';')
      const tag = rawTag.trim()
      if (!LANGUAGE_TAG.test(tag)) return
      let q = 1
      for (const param of params) {
        const m = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(param)
        if (m?.[1] !== undefined) q = Number(m[1])
      }
      if (!(q > 0 && q <= 1)) return
      entries.push({ tag: tag.toLowerCase(), q, index })
    })
  entries.sort((a, b) => b.q - a.q || a.index - b.index)
  return entries.map((e) => e.tag)
}

/**
 * 優先順の並びの先頭から、主の言語が有効な言語に当たる最初の物を返す。無ければ `fallback`(省略は ja)。
 * 返すのは LOCALES の値だけで、入力の文字列は返さない。
 */
export function matchLocale(
  preferred: readonly string[],
  enabled: readonly Locale[] = LOCALES,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  for (const tag of preferred) {
    const primary = tag.split('-')[0]?.toLowerCase()
    const hit = enabled.find((l) => l === primary)
    if (hit !== undefined) return hit
  }
  return fallback
}
