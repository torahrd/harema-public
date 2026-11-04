// ログアウト・退会の後に LP で出す知らせの合図(sessionStorage・同じタブの中だけ)。
// URL・cookie・サーバには何も載せない。読んだら必ず消す(1 回だけ)。60 秒を超えた印は無効。
// ログアウトは action を呼ぶ前に置き、失敗で clearLpNotice で消す。
export type LpNoticeKind = 'logout' | 'withdraw'

export const LP_NOTICE_KEY = 'harema:lp-notice'
export const LP_NOTICE_MAX_AGE_MS = 60_000

type GetStorage = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const defaultStorage: GetStorage = () => window.sessionStorage

function isKind(v: unknown): v is LpNoticeKind {
  return v === 'logout' || v === 'withdraw'
}

export function markLpNotice(kind: LpNoticeKind, getStorage: GetStorage = defaultStorage, now: number = Date.now()): void {
  try {
    getStorage().setItem(LP_NOTICE_KEY, JSON.stringify({ k: kind, t: now }))
  } catch {
    // 保存が使えない環境。知らせを出さないだけ。
  }
}

export function clearLpNotice(getStorage: GetStorage = defaultStorage): void {
  try {
    getStorage().removeItem(LP_NOTICE_KEY)
  } catch {
    // 保存が使えない環境。置けてもいないので何もしない。
  }
}

export function takeLpNotice(getStorage: GetStorage = defaultStorage, now: number = Date.now()): LpNoticeKind | null {
  let raw: string | null = null
  try {
    const storage = getStorage()
    raw = storage.getItem(LP_NOTICE_KEY)
    try {
      storage.removeItem(LP_NOTICE_KEY)
    } catch {
      // 消せなくても読んだ結果は下で判定する。
    }
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { k, t } = v as { k?: unknown; t?: unknown }
    if (!isKind(k)) return null
    if (typeof t !== 'number' || !Number.isFinite(t)) return null
    const age = now - t
    if (age < 0 || age > LP_NOTICE_MAX_AGE_MS) return null
    return k
  } catch {
    return null
  }
}
