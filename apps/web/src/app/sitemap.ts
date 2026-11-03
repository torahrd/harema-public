import type { MetadataRoute } from 'next'
import { PUBLIC_INDEXABLE_PATHS, SITE_ORIGIN } from '@/lib/site'

// 公開ページだけを載せる。更新日は正確に言えないので書かない(Google は lastmod が正確なときだけ使う)。
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_INDEXABLE_PATHS.map((path) => ({ url: path === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${path}` }))
}
