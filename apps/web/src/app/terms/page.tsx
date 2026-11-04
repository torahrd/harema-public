import type { Metadata } from 'next'
import { terms } from '../_public/legal'
import { LegalBody } from '../_public/linkify'
import { BackToTop } from '../_public/back-to-top'
import { SiteHeader } from '../_public/site-header'
import { SiteFooter } from '../_public/site-footer'
import { SiteAnalytics } from '../_public/site-analytics'

export const metadata: Metadata = { title: '利用規約 | hareMa' }

export default function TermsPage() {
  return <main className="public"><SiteHeader /><div className="public-content public-document"><BackToTop /><span className="caption-lead">TERMS</span><h1>{terms.title}</h1><p className="public-revised">最終改定日 {terms.revisedOn}</p><LegalBody document={terms} name="terms" /></div><SiteFooter page="terms" /><SiteAnalytics /></main>
}
