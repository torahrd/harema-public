import type { Metadata } from 'next'
import { publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { PrivacyView } from '@/app/_public/document-view'

export const metadata: Metadata = { title: publicCopy('ja').privacy.title, alternates: publicAlternates('/privacy') }

export default function PrivacyViewPage() {
  return <PrivacyView locale="ja" />
}
