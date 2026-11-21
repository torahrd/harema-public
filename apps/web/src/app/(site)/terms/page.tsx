import type { Metadata } from 'next'
import { publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { TermsView } from '@/app/_public/document-view'

export const metadata: Metadata = { title: publicCopy('ja').terms.title, alternates: publicAlternates('/terms') }

export default function TermsViewPage() {
  return <TermsView locale="ja" />
}
