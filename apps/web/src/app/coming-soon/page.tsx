import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { isLpOnly } from '@/lib/lp-only'
import '../lp.css'

// LP を先に出す間の Coming soon のページ(所有者の決定 2026-11-03 09:28 JST「LP を先に出す」)。
// env HAREMA_LP_ONLY=1 の build だけで出す。部品と値は LP の最初の段のまま(新しい色・字・余白は無し)。
export const metadata: Metadata = { title: 'Coming soon | hareMa', robots: { index: false } }

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171918' },
  ],
}

export default function ComingSoonPage() {
  if (!isLpOnly(process.env)) notFound()
  return (
<div className="lp bw qf">
<header className="lp-head lp-in">
<Link className="wordmark" href="/">hareMa</Link>
<nav className="lp-nav" aria-label="ページ">
<Link href="/#about">このアプリについて</Link>
</nav>
</header>

<main>
<section className="s1 lp-in" aria-labelledby="soon-h1">
<div className="s1-text">
<h1 className="h1 hd" id="soon-h1" lang="en">Coming soon</h1>
<p className="lead hd"><span className="lb">ブラウザで使える <span className="nw">hareMa は、</span></span><span className="lb">まもなく公開します。</span><span className="lb"><span className="nw">iPhone のアプリも、</span><wbr />並行して作っています。</span></p>
<div className="act">
<Link className="cta" href="/">トップへ戻る</Link>
<p className="x-link hd">最新情報は、<wbr />運営者の <a href="https://x.com/htoranosuke" target="_blank" rel="noopener">X(@htoranosuke)↗</a>で出します。</p>
</div>
</div>
</section>
</main>

<footer className="lp-foot lp-in">
<nav aria-label="フッター"><a href="https://x.com/htoranosuke" target="_blank" rel="noopener">お問い合わせ ↗</a><Link href="/terms">利用規約</Link><Link href="/privacy">プライバシーポリシー</Link></nav>
<span className="lp-copy">© hareMa</span>
</footer>
</div>
  )
}
