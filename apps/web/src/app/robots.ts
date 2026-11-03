import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/site'

// 全体を巡回してよい(ログインの要る道は /login へ送られ、Coming soon は noindex)。サイトマップの場所を知らせる。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
