import { createHash, timingSafeEqual } from 'node:crypto'

/** 秘密の最短の長さ。短い値の入れ間違いで口が開かないよう、起動ではなくここで見る。 */
const CRON_SECRET_MIN_LENGTH = 32

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Vercel Cron の呼び出し(`Authorization: Bearer <CRON_SECRET>`)の照合。
 * 秘密が無い・32 文字未満なら常に false(口は何もしない)。
 * 期待値と受けた値を SHA-256 にしてから `timingSafeEqual` で比べる(長さの違いで早く返さない)。
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (typeof secret !== 'string' || secret.length < CRON_SECRET_MIN_LENGTH) return false
  if (authorization === null) return false
  return timingSafeEqual(sha256(authorization), sha256(`Bearer ${secret}`))
}
