import {
  SHARE_HANDOFF_FUTURE_SKEW_MS,
  SHARE_HANDOFF_TTL_MS,
  shareHandoffSchema,
  type ShareHandoff,
} from '@harema/shared/validations/share-handoff'

// 共有の受け口(/share)から地図(/map)へ渡す中身(sessionStorage・同じタブの中だけ)。
// lp-notice.ts と同じ作り: 置く → 読んだら必ず消す → 期限(iOS と同じ 10 分・1 分先まで)。
// ログイン・登録の道はどれも同じタブの中で最後は /map に着くので、置いておけば続きから始まる。
// 相対 import・package import だけ(`@/`・`server-only` を持たない)。
export const SHARE_PENDING_KEY = 'harema:share-pending'

type GetStorage = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const defaultStorage: GetStorage = () => window.sessionStorage

/** 共有の解析結果から、置く中身を作る。両方空・スキーマに通らない物は null。 */
export function handoffFromParsed(
  parsed: { searchQuery: string; sourceText: string | null },
  now: number = Date.now(),
): ShareHandoff | null {
  if (parsed.searchQuery === '' && parsed.sourceText === null) return null
  const result = shareHandoffSchema.safeParse({
    v: 1,
    query: parsed.searchQuery,
    sourceText: parsed.sourceText,
    createdAt: now,
  })
  return result.success ? result.data : null
}

export function putPendingShare(handoff: ShareHandoff, getStorage: GetStorage = defaultStorage): void {
  try {
    getStorage().setItem(SHARE_PENDING_KEY, JSON.stringify(handoff))
  } catch {
    // 保存が使えない環境。共有の続きが無いだけで、地図は普通に開く。
  }
}

export function takePendingShare(
  getStorage: GetStorage = defaultStorage,
  now: number = Date.now(),
): { query: string; sourceText: string | null } | null {
  let raw: string | null = null
  try {
    const storage = getStorage()
    raw = storage.getItem(SHARE_PENDING_KEY)
    try {
      storage.removeItem(SHARE_PENDING_KEY)
    } catch {
      // 消せなくても読んだ結果は下で判定する。
    }
  } catch {
    return null
  }
  if (raw === null) return null
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = shareHandoffSchema.safeParse(json)
  if (!parsed.success) return null
  const age = now - parsed.data.createdAt
  if (age > SHARE_HANDOFF_TTL_MS || age < -SHARE_HANDOFF_FUTURE_SKEW_MS) return null
  return { query: parsed.data.query, sourceText: parsed.data.sourceText }
}
