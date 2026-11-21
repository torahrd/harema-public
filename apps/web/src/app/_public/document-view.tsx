import { NEWS, newsDateTime, newsText } from './news'
import { NewsSentence } from './news-sentence'
import { privacy, privacyEn, terms, termsEn } from './legal'
import { LegalBody } from './linkify'
import { BackToTop } from './back-to-top'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { SiteAnalytics } from './site-analytics'
import { publicCopy, type PublicLocale } from './copy'

/**
 * 公開 3 頁(/news・/terms・/privacy とその英語版 /en/…)の本体。頁(page.tsx)は metadata を持ち、この部品を言語を引数にして呼ぶ。
 * 言語は要求から決めず引数で受けるので、頁は静的のまま。
 */
export function NewsView({ locale }: { locale: PublicLocale }) {
  const c = publicCopy(locale)
  return <main className="public"><SiteHeader locale={locale} /><div className="public-content public-document"><BackToTop {...backProps(locale)} /><span className="caption-lead">{c.news.caption}</span><h1>{c.news.heading}</h1>
<ol className="news-list">{NEWS.map((item) => { const { title, texts } = newsText(item, locale); return <li className="news-item" key={`${item.date}-${item.targets.join()}-${item.title}`}><p className="news-meta"><time className="news-date" dateTime={newsDateTime(item.date)}>{item.date}</time>{item.targets.map((t) => <span className="news-tag" key={t}>{t}</span>)}</p><div className="news-t"><p className="news-ttl">{title}</p>{texts.length > 1 ? <ul className="news-ul">{texts.map((text) => <li key={text}><NewsSentence text={text} locale={locale} /></li>)}</ul> : texts.map((text) => <p className="news-d" key={text}><NewsSentence text={text} locale={locale} /></p>)}</div></li> })}</ol>
</div><SiteFooter page="news" locale={locale} /><SiteAnalytics /></main>
}

export function TermsView({ locale }: { locale: PublicLocale }) {
  const c = publicCopy(locale)
  const doc = locale === 'en' ? termsEn : terms
  return <main className="public"><SiteHeader locale={locale} /><div className="public-content public-document"><BackToTop {...backProps(locale)} /><span className="caption-lead">{c.terms.caption}</span><h1>{doc.title}</h1><p className="public-revised">{c.terms.revised + ' '}{doc.revisedOn}</p><LegalBody document={doc} name="terms" lang={locale} /></div><SiteFooter page="terms" locale={locale} /><SiteAnalytics /></main>
}

export function PrivacyView({ locale }: { locale: PublicLocale }) {
  const c = publicCopy(locale)
  const doc = locale === 'en' ? privacyEn : privacy
  return <main className="public"><SiteHeader locale={locale} /><div className="public-content public-document"><BackToTop {...backProps(locale)} /><span className="caption-lead">{c.privacy.caption}</span><h1>{doc.title}</h1><p className="public-revised">{c.privacy.revised + ' '}{doc.revisedOn}</p><LegalBody document={doc} name="privacy" lang={locale} /></div><SiteFooter page="privacy" locale={locale} /><SiteAnalytics /></main>
}

/** 戻る道。日本語は今までどおり(既定の語と `/`)、英語は英語の語と `/en`。 */
function backProps(locale: PublicLocale): { label?: string; href?: string } {
  return locale === 'en' ? { label: publicCopy('en').nav.backToTop, href: '/en' } : {}
}
