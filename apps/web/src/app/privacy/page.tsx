import type { Metadata } from 'next'
import { privacy } from '../_public/legal'
import { LegalBody } from '../_public/linkify'
import { BackToTop } from '../_public/back-to-top'
import { SiteHeader } from '../_public/site-header'
import { SiteFooter } from '../_public/site-footer'
import { SiteAnalytics } from '../_public/site-analytics'

export const metadata: Metadata = { title: 'プライバシーポリシー | hareMa' }

export default function PrivacyPage() {
  return <main className="public"><SiteHeader /><div className="public-content public-document"><BackToTop /><span className="caption-lead">PRIVACY</span><h1>{privacy.title}</h1><p className="public-revised">最終改定日 {privacy.revisedOn}</p><LegalBody document={privacy} name="privacy" /></div><SiteFooter page="privacy" /><SiteAnalytics /></main>
}
