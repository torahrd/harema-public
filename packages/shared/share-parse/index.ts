import { SHARE_QUERY_MAX_LENGTH, SOURCE_TEXT_MAX_LENGTH } from '../constants'
import { nameFromGoogleMapsUrl } from '../share-url'
import { sourceUrlSchema } from '../validations'

/**
 * 他のアプリの「共有」から届いた中身(URL・文字)を、保存の画面へ渡す 2 つに分ける。
 *
 *   - `sourceText` … 出典に入れる URL。共有した人を示す追跡の印(`igsh` など)は落とす。
 *   - `searchQuery` … 検索欄に入れる店名らしい文字。Instagram のように URL しか届かないときは空。
 *
 * 店の確定はここでしない。検索欄の候補を利用者が押して確定する(今の保存と同じ経路で、
 * Place Details の回数を増やさない)。ネットワークを使わない純粋な関数。
 */

export type SharedItem = { kind: 'url' | 'text'; value: string }

export type SharedOrigin = 'google-maps' | 'instagram' | 'tabelog' | 'other'

export type ParsedShare = {
  origin: SharedOrigin
  sourceText: string | null
  searchQuery: string
  /** Google マップの共有なのに、店名を読めなかった(検索欄が空)。短い URL だけのときなど。 */
  mapsNameMissing: boolean
}

/** 出典に残さない追跡の印。完全一致のほか `utm_` で始まるもの。 */
const TRACKING_PARAMS = new Set([
  'igsh',
  'igshid',
  'g_st',
  'g_ep',
  'fbclid',
  'gclid',
  'si',
  'share_id',
  'ref',
  'ref_src',
])

/** 文の中の http(s) の URL。全角の空白・括弧・引用符で区切る。 */
const URL_IN_TEXT = /https?:\/\/[^\s「」『』()（）<>"'、。]+/giu

/** ページの題の後ろに付くサイト名(「店名 - 食べログ」の「 - 食べログ」)。 */
const SITE_SUFFIX =
  /\s*[-|｜–—]\s*(食べログ|Retty|ホットペッパーグルメ|ぐるなび|一休\.com レストラン|Google マップ|Google Maps|Instagram)\s*$/iu

/** サイト名だけの行(`SITE_SUFFIX` の一覧と同じ名前)。 */
const SITE_NAME_ONLY =
  /^(食べログ|Retty|ホットペッパーグルメ|ぐるなび|一休\.com レストラン|Google マップ|Google Maps|Instagram)$/iu

/** 食べログの題に多い「(最寄り駅/ジャンル)」の部分。 */
const TRAILING_PAREN = /\s*[（(][^（）()]*[)）]\s*$/u

const codePoints = (value: string): string[] => Array.from(value)

export function originOf(url: string): SharedOrigin {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'other'
  }
  if (host === 'maps.app.goo.gl' || host === 'goo.gl' || host.endsWith('maps.google.com')) return 'google-maps'
  if ((host === 'www.google.com' || host === 'google.com') && new URL(url).pathname.startsWith('/maps')) {
    return 'google-maps'
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
  if (host === 'tabelog.com' || host.endsWith('.tabelog.com')) return 'tabelog'
  return 'other'
}

/** 追跡の印を落とした URL。出典として受け付けない形(http(s) 以外・userinfo つき)は null。 */
export function cleanSourceUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!sourceUrlSchema.safeParse(trimmed).success) return null
  const url = new URL(trimmed)
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key)
    }
  }
  const cleaned = url.toString()
  return codePoints(cleaned).length <= SOURCE_TEXT_MAX_LENGTH ? cleaned : null
}

/** 文から URL を除き、最初の空でない行を店名の候補にする。サイト名の飾りは落とす。 */
export function queryFromText(text: string): string {
  const withoutUrls = text.replace(URL_IN_TEXT, '\n')
  const firstLine = withoutUrls
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .find((line) => line.length > 0)
  if (firstLine === undefined) return ''
  // サイト名だけの行(「Google マップ」「食べログ」など)は店名にしない
  if (SITE_NAME_ONLY.test(firstLine)) return ''
  let query = firstLine.replace(SITE_SUFFIX, '')
  query = query.replace(TRAILING_PAREN, '').trim()
  return codePoints(query).slice(0, SHARE_QUERY_MAX_LENGTH).join('').trim()
}

export function parseSharedItems(items: readonly SharedItem[]): ParsedShare {
  const texts = items.filter((item) => item.kind === 'text').map((item) => item.value)
  const urlCandidates = [
    ...items.filter((item) => item.kind === 'url').map((item) => item.value),
    ...texts.flatMap((text) => text.match(URL_IN_TEXT) ?? []),
  ]

  let sourceText: string | null = null
  for (const candidate of urlCandidates) {
    sourceText = cleanSourceUrl(candidate)
    if (sourceText !== null) break
  }

  const origin = sourceText === null ? 'other' : originOf(sourceText)
  // 優先: (1) 文から取った店名 → (2) URL の候補のうち長い Google マップの URL から読めた店名 → (3) 空。Instagram は常に空。
  let searchQuery = ''
  if (origin !== 'instagram') {
    searchQuery = texts.map(queryFromText).find((q) => q.length > 0) ?? ''
    if (searchQuery === '' && origin === 'google-maps') {
      searchQuery = urlCandidates.map(nameFromGoogleMapsUrl).find((q) => q.length > 0) ?? ''
    }
  }

  return { origin, sourceText, searchQuery, mapsNameMissing: origin === 'google-maps' && searchQuery === '' }
}

/**
 * 共有の拡張の入口(root の props)から来る `url` / `text` / `texts` を `SharedItem` にする。
 * `texts` は patch した拡張が集めた全部の文(本文・文の添付・題)。配列でなければ無視する。
 * 並びは url → text → texts の順で、同じ文は 1 回。
 * 画像・動画・ファイルは見ない(活性化の規則に入れていない = 画像だけの共有では拡張が出ない)。
 * 空・文字列でない値は捨てる。
 */
export function itemsFromInitialProps(props: { url?: unknown; text?: unknown; texts?: unknown }): SharedItem[] {
  const items: SharedItem[] = []
  if (typeof props.url === 'string' && props.url.trim() !== '') items.push({ kind: 'url', value: props.url })
  const seen = new Set<string>()
  const pushText = (value: unknown) => {
    if (typeof value !== 'string' || value.trim() === '' || seen.has(value)) return
    seen.add(value)
    items.push({ kind: 'text', value })
  }
  pushText(props.text)
  if (Array.isArray(props.texts)) for (const value of props.texts) pushText(value)
  return items
}
