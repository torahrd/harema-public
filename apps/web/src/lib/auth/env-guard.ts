/**
 * 上書きの env の守り(LR-S6)。
 *
 * `FIREBASE_AUTH_ORIGIN_OVERRIDE`・`FIREBASE_X509_URL_OVERRIDE` は、手元の検査で Firebase の口と
 * 公開鍵の一覧の取得先を発行の口(`tools/auth-fixture`)へ向けるためのもの。本番に入ると
 * ID トークンの署名の検証が攻撃者の鍵に向くため、`VERCEL` が設定された環境(Preview・本番)で
 * どちらかが空でなければ起動を失敗させる。上書きだけ(`VERCEL` 無し)なら起動できる。
 *
 * 置き方の約束: 相対 import・`@/`・`server-only` を持たない(`next.config.ts` と node の検査から
 * 直接読む)。env の値は例外の文に出さない(名前だけ)。
 */
export const FIREBASE_OVERRIDE_ENV_NAMES = [
  'FIREBASE_AUTH_ORIGIN_OVERRIDE',
  'FIREBASE_X509_URL_OVERRIDE',
] as const

export function assertNoOverridesOnVercel(env: Record<string, string | undefined>): void {
  const onVercel = (env.VERCEL ?? '').length > 0
  if (!onVercel) return
  const present = FIREBASE_OVERRIDE_ENV_NAMES.filter((name) => (env[name] ?? '').length > 0)
  if (present.length > 0) {
    throw new Error(
      `Refusing to start: ${present.join(', ')} must not be set when VERCEL is set (the override is for local checks only)`,
    )
  }
}
