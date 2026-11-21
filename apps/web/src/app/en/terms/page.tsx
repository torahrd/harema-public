import type { Metadata } from 'next'
import { publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { TermsView } from '@/app/_public/document-view'

export const metadata: Metadata = { title: publicCopy('en').terms.title, alternates: publicAlternates('/en/terms') }

export default function TermsViewPage() {
  return <TermsView locale="en" />
}
