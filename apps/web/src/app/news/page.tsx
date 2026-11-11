import type { Metadata } from 'next'
import { NEWS, newsDateTime } from '../_public/news'
import { NewsSentence } from '../_public/news-sentence'
import { BackToTop } from '../_public/back-to-top'
import { SiteHeader } from '../_public/site-header'
import { SiteFooter } from '../_public/site-footer'
import { SiteAnalytics } from '../_public/site-analytics'

export const metadata: Metadata = { title: '更新情報 | hareMa' }

export default function NewsPage() {
  return <main className="public"><SiteHeader /><div className="public-content public-document"><BackToTop /><span className="caption-lead">UPDATES</span><h1>更新情報</h1>
<ol className="news-list">{NEWS.map((item) => <li className="news-item" key={`${item.date}-${item.title}`}><p className="news-meta"><time className="news-date" dateTime={newsDateTime(item.date)}>{item.date}</time><span className="news-tag">{item.target}</span></p><p className="news-t"><span className="news-ttl">{item.title}</span><NewsSentence text={item.text} /></p></li>)}</ol>
</div><SiteFooter page="news" /><SiteAnalytics /></main>
}
