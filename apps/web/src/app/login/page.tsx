import Link from 'next/link'
import { APP_VERSION } from '../_public/content'
import { LoginForm } from './login-form'

/**
 * ログイン画面(spec §6.1)。静的クローム(head の wordmark + ABOUT、foot の版表記 + PRIVACY)を
 * Server Component で組み、中身(eyebrow / 見出し / 同意 2 つ / Apple・Google のボタン)を
 * Client の <LoginForm> に委ねる。メールのログインと旧コールバックの `?error=` は撤去した
 * (login-replace)。ボタンの動作とログイン失敗の表示は login-form.tsx(popup → `POST /auth/session`)。
 * 見た目はデザインシステム Quiet Signal(globals.css 7.・FREEZE compare-v3 の ①)。`qs` が面の根、`qs-page` が全画面の背景。
 */
export default function LoginPage() {
  return (
    <main className="qs qs-page">
      <div className="qs-lg">
        <header className="qs-hd">
          <span className="qs-wm">hareMa</span>
          <Link href="/#about" className="qs-lab">
            ABOUT
          </Link>
        </header>
        <div className="qs-top48" />

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
