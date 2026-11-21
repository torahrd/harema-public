/**
 * 検索エンジン向けの公開の道(robots.txt・sitemap.xml)。
 *
 * 置き方の約束: 相対 import・`@/`・`server-only` を持たない(node の検査から直接読む)。
 * 本番の出どころは harema.app の apex だけ(runbook D7・www 転送なし)。Preview は Vercel が
 * `X-Robots-Tag: noindex` を付けるので、出どころを env から取らず固定する。
 */
export const SITE_ORIGIN = 'https://harema.app'

/** 検索に載せる公開ページ。ログインの外で読めて、検索よけ(noindex)を付けていない道だけ。 */
export const PUBLIC_INDEXABLE_PATHS = ['/', '/terms', '/privacy', '/news', '/en', '/en/terms', '/en/privacy', '/en/news'] as const

/** 解析のタグを動かす道(公開ページ)。この外では Google の公式の止め方で送信を止める。 */
export const PUBLIC_ANALYTICS_PATHS = ['/', '/terms', '/privacy', '/news', '/en', '/en/terms', '/en/privacy', '/en/news', '/coming-soon'] as const

/**
 * 公開ページの言語の対(日本語の道, 英語の道)。4 組だけ。`/about`・`/coming-soon`・`/share` は英語版が無いので入れない。
 * 切り替えのリンクと hreflang・canonical は、この表だけから作る(入力の文字列を混ぜない = 外のサイトへ飛ばす道を作らない)。
 */
export const PUBLIC_LANGUAGE_PAIRS = [
  ['/', '/en'],
  ['/news', '/en/news'],
  ['/terms', '/en/terms'],
  ['/privacy', '/en/privacy'],
] as const

/** 相手の言語の同じ頁の道。対に無い道は `null`(リンクを出さない)。返すのは表の定数だけ。 */
export function otherLanguagePath(path: string): string | null {
  for (const [ja, en] of PUBLIC_LANGUAGE_PAIRS) {
    if (path === ja) return en
    if (path === en) return ja
  }
  return null
}

/**
 * 公開ページの `metadata.alternates`(canonical と hreflang)。頁はこの戻り値だけを使い、値を直書きしない。
 * 自動の転送をしないので、x-default は日本語の道(今の URL の既定)。metadataBase(SITE_ORIGIN)で絶対の URL になる。
 * 対に無い道を渡したら、頁の書き間違いなので投げる(build が止まる)。
 */
export function publicAlternates(path: string): { canonical: string; languages: { ja: string; en: string; 'x-default': string } } {
  for (const [ja, en] of PUBLIC_LANGUAGE_PAIRS) {
    if (path === ja || path === en) return { canonical: path, languages: { ja, en, 'x-default': ja } }
  }
  throw new Error(`publicAlternates: not a public page with a language pair: ${path}`)
}

/**
 * リンクを貼ったときのカード(OGP・X のカード)の画像。所有者の決定 2026-11-03 12:58 JST(案 B「LP の最初の画面の縮図」)。
 * `public/og.png`(1200x630)。LP を先に出す間の転送でも、public 直下の .png は送られない。
 */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'hareMa' } as const
