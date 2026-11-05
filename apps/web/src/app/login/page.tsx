import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getVerifiedUser } from '@/lib/auth/session'
import { APP_VERSION } from '../_public/content'
import { BackToTop } from '../_public/back-to-top'
import { LoginForm } from './login-form'

/**
 * ログイン画面(spec §6.1)。静的クローム(head の wordmark + ABOUT、foot の版表記 + PRIVACY)を
 * Server Component で組み、中身(見出し / 同意 2 つ / Apple・Google のボタン)を
 * Client の <LoginForm> に委ねる。メールのログインと旧コールバックの `?error=` は撤去した
 * (login-replace)。ボタンの動作とログイン失敗の表示は login-form.tsx(popup → `POST /auth/session`)。
 * hareMa と戻るは / へ(所有者 2026-11-04・login-back)。
 * ログイン済みの人が新しいタブで LP の「ログイン」から来たとき、もう一度ログインさせず /map へ送る。
 * 判定は getVerifiedUser()(DB の失効まで見る)で行い、cookie の有無だけでは判定しない
 * (cookie だけで送ると、DB で失効した cookie が /map → /login → /map の輪を作る)。
 * 未ログイン・失効・確かめられないときは画面を出す。プロフィール未作成は /map のガードが /onboarding へ送る。
 * 見た目はデザインシステム Quiet Signal(globals.css 7.・FREEZE compare-v3 の ①)。`qs` が面の根、`qs-page` が全画面の背景。
 */
export default async function LoginPage() {
  if (await getVerifiedUser()) redirect('/map')

  return (
    <main className="qs qs-page">
      <div className="qs-lg">
        <header className="qs-hd">
          <Link href="/" className="qs-wm">
            hareMa
          </Link>
          <Link href="/#about" className="qs-lab">
            ABOUT
          </Link>
        </header>
        <div className="qs-top48">
          <BackToTop />
        </div>

        <LoginForm />

        <footer className="qs-ft">
          <span className="qs-lab">v {APP_VERSION} · 日本語のみ</span>
          <Link href="/privacy" className="qs-lab">
            PRIVACY
          </Link>
        </footer>
      </div>
    </main>
  )
}
