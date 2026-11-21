import type { Metadata } from 'next'
import { publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { NewsView } from '@/app/_public/document-view'

export const metadata: Metadata = { title: publicCopy('ja').news.title, alternates: publicAlternates('/news') }

export default function NewsViewPage() {
  return <NewsView locale="ja" />
}
