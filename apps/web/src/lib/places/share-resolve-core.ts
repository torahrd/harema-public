/**
 * 共有の Google マップの短い URL(`https://maps.app.goo.gl/<id>`)をたどって店名を得る核
 * (`/api/mobile/v1/share/resolve` が通る)。
 *
 * 置き方の約束(`save-core.ts` と同じ): 外向きの通信・DB は deps として受ける。認可(利用者の確かめ)は呼び出し側が
 * 先に済ませる。`server-only` は入れない(試験が直接読む。実物の配線は `share-resolve-deps.ts`)。
 *
 * SSRF の守り(spec §11.1-7):
 *   - 行き先は `maps.app.goo.gl` に固定。受けた URL は `mapsShortUrlId` で id だけ取り、`https://maps.app.goo.gl/<id>` を組み直す
 *     (受けた query・hash・port・userinfo を使わない)。
 *   - 転送は追わない。1 回 GET して `Location` ヘッダを読むだけで、返った先には接続しない。本文は読まずに切る。
 *   - 全体の締切 5 秒。Cookie・Authorization は付けない。解決先 IP の検証は注入する agent の `lookup`(`guardedLookup`)。
 *   - URL・店名をログに出さない(`console` を使わない)。
 */
import type { Agent, ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { mapsShortUrlId, nameFromGoogleMapsUrl } from '@harema/shared/share-url'
import type { ShareResolveResponse } from '@harema/shared/validations'

export type ShareResolveClaim =
  | { allowed: true; key: string }
  | { allowed: false; cachedTitle: string }

export type ShareResolveDeps = {
  /** 抑制の台帳に問う。引数は組み直した正規の URL(鍵に変えるのは実物の配線)。 */
  claim: (canonicalUrl: string) => Promise<ShareResolveClaim>
  /** 短い URL の id の Location(転送先)。取れなければ null。 */
  fetchLocation: (id: string) => Promise<string | null>
  /** 取得の終了を記録する(取れなかったときは null)。 */
  complete: (key: string, name: string | null) => Promise<boolean>
}

const SHORT_URL_ORIGIN = 'https://maps.app.goo.gl'

/** 全体の締切。`fetch-og-title.ts` の `OGP_TIMEOUT_MS` と同じ値。 */
export const SHARE_RESOLVE_TIMEOUT_MS = 5_000

const USER_AGENT = 'hareMa/1.0 (+https://harema.app)'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type ShareRequest = (url: string, options: RequestOptions) => ClientRequest

export async function runShareResolve(
  rawUrl: string,
  deps: ShareResolveDeps,
): Promise<ShareResolveResponse> {
  const id = mapsShortUrlId(rawUrl)
  if (id === null) return { ok: false, reason: 'not_maps_short_url' }

  const claim = await deps.claim(`${SHORT_URL_ORIGIN}/${id}`)
  if (!claim.allowed) {
    const cached = clip(claim.cachedTitle)
    return cached === '' ? { ok: false, reason: 'unavailable' } : { ok: true, query: cached }
  }

  let location: string | null = null
  try {
    location = await deps.fetchLocation(id)
  } catch {
    location = null
  }
  // ホストの照合は nameFromGoogleMapsUrl に任せる(ここに別の照合を置かない)。
  const name = location === null ? '' : nameFromGoogleMapsUrl(location)

  // 取れなかったときも必ず記録する(lease を解放し、失敗も窓の間だけ覚える)。
  try {
    await deps.complete(claim.key, name === '' ? null : name)
  } catch {
    // 記録できなくても、取れた名前は返す。
  }
  return name === '' ? { ok: false, reason: 'unavailable' } : { ok: true, query: name }
}

function clip(value: string): string {
  return Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, 60).join('').trim()
}

/**
 * `https://maps.app.goo.gl/<id>` を GET 1 回して、転送(301・302・303・307・308)の `Location` を返す。
 * それ以外の応答・error・時間切れは null。転送先には接続しない。本文は読まずに接続を切る。
 */
export function readRedirectLocation(
  request: ShareRequest,
  id: string,
  opts: { agent: Agent; timeoutMs?: number },
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? SHARE_RESOLVE_TIMEOUT_MS
  return new Promise((resolve) => {
    let settled = false
    let req: ClientRequest | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      if (deadline !== null) clearTimeout(deadline)
      req?.destroy()
      resolve(value)
    }

    // 無通信の timeout だけでなく、接続から応答までの全体にも締切を置く。
    deadline = setTimeout(() => finish(null), timeoutMs)

    try {
      req = request(`${SHORT_URL_ORIGIN}/${id}`, {
        agent: opts.agent,
        method: 'GET',
        timeout: timeoutMs,
        // Cookie / Authorization は付けない。
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': USER_AGENT },
      })
    } catch {
      finish(null)
      return
    }
    req.on('timeout', () => finish(null))
    req.on('error', () => finish(null))
    req.on('response', (response: IncomingMessage) => {
      const status = response.statusCode ?? 0
      const location = response.headers.location
      finish(REDIRECT_STATUSES.has(status) && typeof location === 'string' ? location : null)
    })
    req.end()
  })
}
