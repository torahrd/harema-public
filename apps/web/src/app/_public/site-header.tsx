
import Link from 'next/link'

export function SiteHeader() {
  return <header className="public-header"><Link href="/" className="wordmark">hareMa</Link><a href="/login">ログイン</a></header>
}
