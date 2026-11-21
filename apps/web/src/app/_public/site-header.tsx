
import Link from 'next/link'
import { publicCopy, type PublicLocale } from './copy'

export function SiteHeader({ locale = 'ja' }: { locale?: PublicLocale }) {
  return <header className="public-header"><Link href={locale === 'en' ? '/en' : '/'} className="wordmark">hareMa</Link><Link href="/login" prefetch={false}>{publicCopy(locale).nav.login}</Link></header>
}
