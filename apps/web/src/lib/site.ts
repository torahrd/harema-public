/**
 * 検索エンジン向けの公開の道(robots.txt・sitemap.xml)。
 *
 * 置き方の約束: 相対 import・`@/`・`server-only` を持たない(node の検査から直接読む)。
 * 本番の出どころは harema.app の apex だけ(runbook D7・www 転送なし)。Preview は Vercel が
 * `X-Robots-Tag: noindex` を付けるので、出どころを env から取らず固定する。
 */
export const SITE_ORIGIN = 'https://harema.app'

/** 検索に載せる公開ページ。ログインの外で読めて、検索よけ(noindex)を付けていない道だけ。 */
export const PUBLIC_INDEXABLE_PATHS = ['/', '/terms', '/privacy'] as const

/** 解析のタグを動かす道(公開ページ)。この外では Google の公式の止め方で送信を止める。 */
export const PUBLIC_ANALYTICS_PATHS = ['/', '/terms', '/privacy', '/coming-soon'] as const
