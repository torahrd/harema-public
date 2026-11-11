/**
 * LP を先に出す間の行き先の付け替え(所有者の決定 2026-11-03 09:28 JST「LP を先に出す」)。
 *
 * env `HAREMA_LP_ONLY` が `1` の build だけ、LP(`/`)・利用規約・プライバシーポリシー・更新情報・
 * `/about`・Coming soon のページと静的ファイルの外を、すべて `/coming-soon` へ一時的に送る。
 * ログイン・地図・API・auth の口に届かないので、DB と Firebase を一度も呼ばない。
 * 公開の日に env を外して build し直せば、元の行き先に戻る。
 *
 * 置き方の約束: 相対 import・`@/`・`server-only` を持たない(`next.config.ts` と node の検査から
 * 直接読む)。
 */
export const LP_ONLY_ENV_NAME = 'HAREMA_LP_ONLY'
export const COMING_SOON_PATH = '/coming-soon'

/** 送らない道。先頭の `$` は `/` そのもの(LP)。静的ファイルの拡張子は、`public/` の直下(`/` の無い名前)だけを通す(`/places/x.svg` のような動的な道は送る)。 */
export const LP_ONLY_SOURCE =
  '/:path((?!$|terms$|privacy$|news$|about$|coming-soon$|_next/|favicon\\.ico$|[^/]*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)'

export function isLpOnly(env: Record<string, string | undefined>): boolean {
  return env[LP_ONLY_ENV_NAME] === '1'
}

export function lpOnlyRedirects(env: Record<string, string | undefined>) {
  if (!isLpOnly(env)) return []
  return [{ source: LP_ONLY_SOURCE, destination: COMING_SOON_PATH, permanent: false }]
}
