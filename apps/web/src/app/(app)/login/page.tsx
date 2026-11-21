import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { legalPath, messages, type Locale } from '@harema/shared/i18n'
import { getVerifiedUser } from '@/lib/auth/session'
import { APP_VERSION } from '@/app/_public/content'
import { BackToTop } from '@/app/_public/back-to-top'
import { LangSwitch } from '@/app/_ui/lang-switch'
import { localeCookieWritable, parseLoginLang } from '@/i18n/locale-cookie'
import { LoginForm } from '@/app/login/login-form'

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
 * 言語の切り替え(`?lang=ja|en`・localeSchema で確かめる)は、この画面の表示言語だけを替える。cookie は書かない(ログイン前の訪問者は、今の改定に同意していない)。
 * 選んだ言語は LoginForm がログインの受付(POST /auth/session)へ渡し、受付が同意の記録に成功した時だけ cookie に書く。
 * next-intl の要求の設定(i18n/request.ts)はクエリを読まないので、選んだ時だけ、この画面の中で辞書と言語を差し替える(NextIntlClientProvider と createTranslator)。
 * 見た目はデザインシステム Quiet Signal(globals.css 7.・FREEZE compare-v3 の ①)。`qs` が面の根、`qs-page` が全画面の背景。
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  if (await getVerifiedUser()) redirect('/map')
  const chosen = parseLoginLang((await searchParams).lang)
  const locale: Locale = chosen ?? ((await getLocale()) as Locale)
  const messagesForLocale = messages[locale]
  const t = createTranslator({ locale, messages: messagesForLocale, namespace: 'web.common' })

  return (
    <NextIntlClientProvider locale={locale} messages={messagesForLocale}>
    <main className="qs qs-page" lang={locale}>
      <div className="qs-lg">
        <header className="qs-hd">
          <Link href="/" className="qs-wm">
            hareMa
          </Link>
          <div className="qs-hd-r">
            <Link href="/#about" className="qs-lab">
              ABOUT
            </Link>
            {/* 言語の切り替え(harema#150 の案 B)。幅 360 未満は CSS が「戻る」の行の右へ下ろす。 */}
            {/* 適用の日時(ポリシーの改定)より前は出さない。サーバの時刻で決める(言語の切り替えは改定で足した機能のため。差分レビュー D-系の処分・適用前は言語切替を出さない)。 */}
            {localeCookieWritable() && <LangSwitch variant="head" />}
          </div>
        </header>
        <div className="qs-top48">
          <BackToTop label={t('backToTop')} />
        </div>

        <LoginForm {...(chosen !== null ? { chosenLocale: chosen } : {})} />

        <footer className="qs-ft">
          <span className="qs-lab">v {APP_VERSION}</span>
          <Link href={legalPath(locale, 'privacy')} className="qs-lab">
            PRIVACY
          </Link>
        </footer>
      </div>
    </main>
    </NextIntlClientProvider>
  )
}
