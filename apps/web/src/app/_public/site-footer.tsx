import Link from 'next/link'
import { LangLinks } from './lang-links'
import { publicCopy, type PublicLocale } from './copy'

type PublicPage = 'terms' | 'privacy' | 'news'
/** 頁の道(言語ごと)。足の行き先と、切り替えの相手の言語の対を引く元。 */
const PATHS = {
  ja: { about: '/#about', terms: '/terms', privacy: '/privacy', news: '/news' },
  en: { about: '/en#about', terms: '/en/terms', privacy: '/en/privacy', news: '/en/news' },
} as const

export function SiteFooter({ page, locale = 'ja' }: { page: PublicPage; locale?: PublicLocale }) {
  const nav = publicCopy(locale).nav
  const paths = PATHS[locale]
  const links = [
    { href: paths.about, text: nav.about, page: 'about' },
    { href: paths.terms, text: nav.terms, page: 'terms' },
    { href: paths.privacy, text: nav.privacy, page: 'privacy' },
  ] as const
  return <footer className="public-footer"><nav>
    {links.filter((link) => link.page !== page).map((link) => <Link key={link.href} href={link.href}>{link.text}</Link>)}
    <LangLinks locale={locale} path={paths[page]} />
  </nav><span>© hareMa</span></footer>
}
