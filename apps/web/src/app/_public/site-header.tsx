import Link from 'next/link'

export function SiteHeader() {
  return <header className="public-header"><span className="wordmark">hareMa</span><Link href="/login">ログイン</Link></header>
}
