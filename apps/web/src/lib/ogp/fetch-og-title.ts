import 'server-only'

import { lookup as dnsLookup } from 'node:dns'
import type { LookupAddress, LookupAllOptions } from 'node:dns'
import { Agent as HttpAgent, request as httpRequest } from 'node:http'
import type { IncomingMessage, RequestOptions } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import type { LookupFunction } from 'node:net'
import { SOURCE_TITLE_MAX_LENGTH } from '@harema/shared/constants'
import { isBlockedAddress } from './ip-guard'

/**
 * 出典 URL の og:title をサーバ側で取得する(spec §4.1・§11.1-7)。
 *
 * SSRF ガードは 5 点すべてを構造で満たす:
 *   1. scheme allowlist —— http / https 以外は接続しない
 *   2. 接続時の解決先 IP 検証 —— **接続先 IP を決める経路は 2 本しかなく、どちらも `isBlockedAddress`
 *      という同一の遮断表を通る**:ホスト名なら http / https **両 agent** の custom lookup が DNS の
 *      返答を(公開 DNS 名が private へ解決される rebinding を止める)、リテラル IP なら
 *      `isBlockedHostLiteral` が接続前に判定する(node:net は `isIP(host)` が真だと DNS lookup 自体を
 *      省くため、リテラル IP は custom lookup を一度も通らない)
 *   3. redirect 無効化 —— node:http / node:https は既定で追従しない。加えて 3xx を成功にしない
 *   4. timeout + サイズ上限 —— 5 秒 / 512 KB
 *   5. 認証情報を付与しない —— Cookie / Authorization を送らず、`user:pass@` 付き URL は拒否する
 *
 * node builtin を import することで Node.js runtime を構造的に要求する(edge では解決できない)。
 */

/** 接続・応答・本文受信を通した全体の締切(S-19 裁定)。 */
const OGP_TIMEOUT_MS = 5_000

/** 受信バイト数の上限(S-19 裁定)。超えた時点で接続を切り、受信済みの分だけを解析する。 */
const OGP_MAX_BYTES = 512 * 1024

const ALLOWED_PROTOCOLS = ['http:', 'https:']

/** og:title は HTML(または XHTML)にしか無い。他の型は解析しない。 */
const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)\b/i

const USER_AGENT = 'hareMa/1.0 (+https://harema.app)'

/**
 * DNS の解決結果を ip-guard に通す lookup。**1 つでも遮断対象が混ざっていたら接続しない** ——
 * 複数レコードのうち片方だけが private というケースで、選ばれ方に安全性を委ねないため。
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const allOptions: LookupAllOptions = { ...options, all: true }
  dnsLookup(hostname, allOptions, (error, addresses: LookupAddress[]) => {
    if (error) {
      callback(error, '', 0)
      return
    }
    const first = addresses[0]
    if (!first || addresses.some((entry) => isBlockedAddress(entry.address))) {
      callback(new Error('Blocked address'), '', 0)
      return
    }
    if (options.all === true) {
      callback(null, addresses)
      return
    }
    callback(null, first.address, first.family)
  })
}

/**
 * リテラル IP のホストを接続前に遮断する。node:net は `isIP(host)` が真のとき **DNS lookup を丸ごと
 * 省いて直接接続する**ため、この経路は guardedLookup を一度も通らない —— 判定の入口が 2 つに分かれる
 * だけで、**通す表は上と同じ `isBlockedAddress` 1 つ**(遮断レンジをここに書き足さない)。
 * ホスト名(`isIP` が 0)は DNS 経路の担当なので、ここでは何も判定しない。
 */
function isBlockedHostLiteral(hostname: string): boolean {
  // URL.hostname の IPv6 は角括弧付き(`[::1]`)。node:http も同じ剥がし方で接続先を決める。
  const host =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (isIP(host) === 0) return false
  return isBlockedAddress(host)
}

/** HTML を受信する。失敗・上限超過以外の異常はすべて null に畳む(内容を呼び出し元へ出さない)。 */
function requestHtml(url: URL): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const secure = url.protocol === 'https:'
    const agent = secure
      ? new HttpsAgent({ lookup: guardedLookup, keepAlive: false })
      : new HttpAgent({ lookup: guardedLookup, keepAlive: false })

    const options: RequestOptions = {
      agent,
      method: 'GET',
      timeout: OGP_TIMEOUT_MS,
      // Cookie / Authorization / Proxy-Authorization は付けない(§11.1-7)。
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': USER_AGENT,
      },
    }
    const request = secure ? httpsRequest(url, options) : httpRequest(url, options)

    let settled = false
    const finish = (value: Buffer | null) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      request.destroy()
      agent.destroy()
      resolve(value)
    }

    // socket の timeout オプションは無通信にしか効かないので、接続から本文受信までの全体にも
    // 締切を置く(少しずつ送り続けて掴み続ける相手を落とす)。
    const deadline = setTimeout(() => finish(null), OGP_TIMEOUT_MS)

    request.on('timeout', () => finish(null))
    request.on('error', () => finish(null))
    request.on('response', (response: IncomingMessage) => {
      const status = response.statusCode ?? 0
      // 3xx を成功にしない = redirect を追わない。4xx / 5xx も同じ扱い。
      if (status < 200 || status >= 300) {
        finish(null)
        return
      }
      if (!HTML_CONTENT_TYPE.test(response.headers['content-type'] ?? '')) {
        finish(null)
        return
      }

      const chunks: Buffer[] = []
      let received = 0
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        if (received > OGP_MAX_BYTES) {
          finish(Buffer.concat(chunks))
        }
      })
      response.on('end', () => finish(Buffer.concat(chunks)))
      response.on('error', () => finish(null))
    })

    request.end()
  })
}

/** 開始タグの入口だけを探す(可変長の量指定子を持たないので、走査は入力長に線形)。 */
const META_TAG_START = /<meta\b/gi

const NAME_START = /[a-zA-Z_:]/
const NAME_CHAR = /[-a-zA-Z0-9_:.]/
const WHITESPACE = /\s/
const UNQUOTED_VALUE_CHAR = /[^\s"'`=<>]/

type Attribute = { name: string; value: string }

/**
 * 開始タグの属性を左から 1 回だけ走査して取り出す。
 *
 * 属性全体を 1 つの正規表現で表すと `名前の量指定子 → \s*= の失敗 → 全長ぶんの後退` が起きて解析が
 * 入力長の 2 乗になる(512 KB で分単位の CPU 占有 = 出典 URL を差し替えるだけで踏める DoS)。本文受信の
 * 締切は解析段には効かないので、**後退が構造的に起きない走査**にしてある。カーソルはどの分岐でも
 * 必ず前進するため、走査は線形で停止する。
 */
function readAttributes(tag: string): Attribute[] {
  const attributes: Attribute[] = []
  let cursor = 0

  while (cursor < tag.length) {
    if (!NAME_START.test(tag.charAt(cursor))) {
      cursor += 1
      continue
    }

    let nameEnd = cursor + 1
    while (nameEnd < tag.length && NAME_CHAR.test(tag.charAt(nameEnd))) nameEnd += 1
    const name = tag.slice(cursor, nameEnd)

    let valueStart = nameEnd
    while (valueStart < tag.length && WHITESPACE.test(tag.charAt(valueStart))) valueStart += 1
    if (tag.charAt(valueStart) !== '=') {
      cursor = nameEnd // 値を持たない属性。名前の直後から読み直す。
      continue
    }
    valueStart += 1
    while (valueStart < tag.length && WHITESPACE.test(tag.charAt(valueStart))) valueStart += 1

    const quote = tag.charAt(valueStart)
    if (quote === '"' || quote === "'") {
      const closing = tag.indexOf(quote, valueStart + 1)
      // 閉じられていない引用符は属性値にならない。
      if (closing === -1) {
        cursor = valueStart + 1
        continue
      }
      attributes.push({ name, value: tag.slice(valueStart + 1, closing) })
      cursor = closing + 1
      continue
    }

    let valueEnd = valueStart
    while (valueEnd < tag.length && UNQUOTED_VALUE_CHAR.test(tag.charAt(valueEnd))) valueEnd += 1
    // `=` の後に値が無い場合は属性にしない。
    if (valueEnd > valueStart) {
      attributes.push({ name, value: tag.slice(valueStart, valueEnd) })
    }
    cursor = valueEnd > valueStart ? valueEnd : valueStart
  }

  return attributes
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function fromCodePoint(code: number): string | null {
  // サロゲート単体・範囲外は文字にならない。
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null
  if (code >= 0xd800 && code <= 0xdfff) return null
  return String.fromCodePoint(code)
}

/** content 属性は実体参照を含みうる。表示ではなく DB へ入る値なので、ここで文字へ戻す。 */
function decodeEntities(value: string): string {
  return value.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (entity, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        return fromCodePoint(Number.parseInt(body.slice(2), 16)) ?? entity
      }
      if (body.startsWith('#')) {
        return fromCodePoint(Number.parseInt(body.slice(1), 10)) ?? entity
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity
    },
  )
}

/**
 * 受信済みバッファから og:title を取り出す。**HTML は一切 UI へ渡さず**、meta タグの content
 * 属性の値だけを文字列として返す(spec §11.4)。
 */
function extractOgTitle(html: string): string | null {
  // 走査位置は前へしか動かさない(同期関数なので lastIndex の共有で競合しない)。
  META_TAG_START.lastIndex = 0
  for (
    let tag = META_TAG_START.exec(html);
    tag !== null;
    tag = META_TAG_START.exec(html)
  ) {
    const tagEnd = html.indexOf('>', META_TAG_START.lastIndex)
    // 閉じられていない開始タグは解析しない。以降に `>` は無いので、ここで走査を終える。
    if (tagEnd === -1) return null

    let key: string | null = null
    let content: string | null = null
    for (const attribute of readAttributes(html.slice(META_TAG_START.lastIndex, tagEnd))) {
      const name = attribute.name.toLowerCase()
      if (name === 'property' || name === 'name') {
        key = attribute.value.trim().toLowerCase()
      } else if (name === 'content') {
        content = attribute.value
      }
    }
    META_TAG_START.lastIndex = tagEnd + 1

    if (key !== 'og:title' || content === null) continue
    const title = decodeEntities(content).replace(/\s+/g, ' ').trim()
    if (title.length > 0) return title
  }
  return null
}

/**
 * 出典 URL の og:title。取得できなければ null(理由は呼び出し元へ出さない)。
 * 200 コードポイントを超える場合は破棄せず先頭 200 で切り詰める(S-10 裁定)。
 */
export async function fetchOgTitle(rawUrl: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return null
  if (url.username !== '' || url.password !== '') return null
  if (isBlockedHostLiteral(url.hostname)) return null

  const body = await requestHtml(url)
  if (!body) return null

  const title = extractOgTitle(body.toString('utf8'))
  if (!title) return null

  return [...title].slice(0, SOURCE_TITLE_MAX_LENGTH).join('')
}
