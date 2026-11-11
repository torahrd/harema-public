import { SHARE_QUERY_MAX_LENGTH } from '../constants'

/**
 * 長い Google マップの URL から店名を読む(純粋・ネットワークを使わない)。
 *
 * 受ける形(ホストは `maps.google.com` の系・`www.google.com`・`google.com`):
 *   1. `/maps/place/<名前>/…` … 最初の段 `<名前>`
 *   2. `/maps/search/?api=1&query=<文字>` … `query`
 *   3. それ以外で `q=` がある(`maps.google.com/?q=`・`/maps?q=`)… `q`
 * `www.google.com`・`google.com` は path が `/maps` で始まるときだけ。座標だけの値は店名にしない。`maps.app.goo.gl` の短い URL・他のホスト・読めない文字は空。
 */

const COORDINATE_ONLY = /^-?\d+(?:\.\d+)?[,\s+]+-?\d+(?:\.\d+)?$/u

function isGoogleMapsHost(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  if (host === 'maps.google.com' || host.endsWith('.maps.google.com')) return true
  // www.google.com・google.com は /maps で始まる path だけ(検索・/sorry などの q= を店名にしない)
  return (host === 'www.google.com' || host === 'google.com') && url.pathname.startsWith('/maps')
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/gu, ' '))
  } catch {
    return ''
  }
}

function rawNameFromUrl(url: URL): string {
  const placeMatch = /^\/maps\/place\/([^/]+)/u.exec(url.pathname)
  if (placeMatch?.[1] !== undefined) return decodeSegment(placeMatch[1])
  const query = url.searchParams.get('query')
  if (query !== null && url.pathname.startsWith('/maps/search')) return query
  return url.searchParams.get('q') ?? ''
}

export function nameFromGoogleMapsUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
  if (!isGoogleMapsHost(url)) return ''
  const value = rawNameFromUrl(url).trim()
  if (value === '' || COORDINATE_ONLY.test(value)) return ''
  const beforeComma = value.split(',')[0] ?? ''
  const collapsed = beforeComma.replace(/\s+/gu, ' ').trim()
  return Array.from(collapsed).slice(0, SHARE_QUERY_MAX_LENGTH).join('').trim()
}

/** `https://maps.app.goo.gl/<id>` の id の形(1 段・英数と `_` `-` だけ)。 */
const SHORT_URL_ID = /^\/([A-Za-z0-9_-]{1,64})$/u

/**
 * Google マップの短い URL の id。たどってよい形(SSRF の要)だけを通す:
 * `https:`・ホストがちょうど `maps.app.goo.gl`・port なし・userinfo なし・path が `/<id>` の 1 段。
 * query と hash は見ない(たどる URL に付けない)。それ以外は null。
 */
export function mapsShortUrlId(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.hostname !== 'maps.app.goo.gl') return null
  if (url.port !== '' || url.username !== '' || url.password !== '') return null
  const match = SHORT_URL_ID.exec(url.pathname)
  return match?.[1] ?? null
}
