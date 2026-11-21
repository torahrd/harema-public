import type { Metadata } from 'next'
import { publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { NewsView } from '@/app/_public/document-view'

export const metadata: Metadata = { title: publicCopy('en').news.title, alternates: publicAlternates('/en/news') }

export default function NewsViewPage() {
  return <NewsView locale="en" />
}
