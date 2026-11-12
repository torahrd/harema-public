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
<ol className="news-list">{NEWS.map((item) => <li className="news-item" key={`${item.date}-${item.targets.join()}-${item.title}`}><p className="news-meta"><time className="news-date" dateTime={newsDateTime(item.date)}>{item.date}</time>{item.targets.map((t) => <span className="news-tag" key={t}>{t}</span>)}</p><div className="news-t"><p className="news-ttl">{item.title}</p>{item.texts.length > 1 ? <ul className="news-ul">{item.texts.map((text) => <li key={text}><NewsSentence text={text} /></li>)}</ul> : item.texts.map((text) => <p className="news-d" key={text}><NewsSentence text={text} /></p>)}</div></li>)}</ol>
</div><SiteFooter page="news" /><SiteAnalytics /></main>
}
