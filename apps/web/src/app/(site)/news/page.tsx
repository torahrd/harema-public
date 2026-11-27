import type { Metadata } from 'next'
import { publicAlternates } from '@/lib/site'
import { publicCopy } from '@/app/_public/copy'
import { requestTime } from '@/app/_public/request-time'
import { NewsView } from '@/app/_public/document-view'

export const metadata: Metadata = { title: publicCopy('ja').news.title, alternates: publicAlternates('/news') }

export default async function NewsViewPage() {
  // 本文・文は、この要求のサーバの時刻で選ぶ(適用の日時の 0 時ちょうどに、デプロイなしで切り替わる。requestTime は await connection() の後の時刻)。
  const now = await requestTime()
  return <NewsView locale="ja" now={now} />
}
