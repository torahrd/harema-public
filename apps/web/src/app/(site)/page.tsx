import type { Metadata, Viewport } from 'next'
import { OG_IMAGE, publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { HomeView } from '@/app/_public/home-view'

const home = publicCopy('ja').home

export const metadata: Metadata = {
  title: home.title,
  description: home.description,
  alternates: publicAlternates('/'),
  // openGraph・twitter は layout の値と浅く合わさらず丸ごと置き換わるので、画像も含めて書く。
  openGraph: { type: 'website', siteName: 'hareMa', locale: 'ja_JP', url: '/', title: home.title, description: home.description, images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', title: home.title, description: home.description, images: [OG_IMAGE] },
}

// ブラウザのツールバーの色を LP の地(Quiet Field の paper / ink)に合わせる。
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171918' },
  ],
}

export default function Home() {
  return <HomeView locale="ja" />
}
