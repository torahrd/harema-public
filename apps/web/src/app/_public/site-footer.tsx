import Link from 'next/link'

type PublicPage = 'terms' | 'privacy' | 'news'
const links = [
  { href: '/#about', text: 'このアプリについて', page: 'about' },
  { href: '/terms', text: '利用規約', page: 'terms' },
  { href: '/privacy', text: 'プライバシーポリシー', page: 'privacy' },
] as const

export function SiteFooter({ page }: { page: PublicPage }) {
  return <footer className="public-footer"><nav>
    {links.filter((link) => link.page !== page).map((link) => <Link key={link.href} href={link.href}>{link.text}</Link>)}
  </nav><span>© hareMa</span></footer>
}
