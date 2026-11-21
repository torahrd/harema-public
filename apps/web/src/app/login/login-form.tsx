'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { legalPath, matchLocale } from '@harema/shared/i18n'
import type { SsoProvider } from '@/lib/auth/browser-flow'
import { ActionError } from '../_auth-ui/action-error'
import { SsoButton } from '../_auth-ui/sso-button'
import { loginWithSso, prepareLogin } from './login-client'
import { JpText } from '../_ui/jp-text'
import { asLineGroups, asLines } from '@/i18n/lines'

/**
 * ログインの画面(login-replace・FREEZE compare-v3 の ① の「新」)。メールのログインは撤去した
 * (Apple / Google のログインではメールを送らない・PLAN §0.3)。
 *
 * 同意の 2 つは Apple / Google のボタンの前に置く(ボタンを押すと Firebase = 米国へ情報が渡るため)。
 * 2 つとも付くまでボタンは押せない(LR-B2)。同意の値は画面の申告で、サーバは送信前に確かめられない
 * (PLAN §0.3・§7)。ボタンの動作は login-client.ts(popup → `POST /auth/session` → 遷移)。
 * `chosenLocale`: 言語の切り替え(`?lang=`)で選んだ言語。ログインの受付に渡すだけで、ここでは cookie を書かない。
 * popup を閉じただけなら何も出さずに押せる状態に戻す。それ以外の失敗は結果の行(× + 2 文)をボタンの下に出す。
 */
export function LoginForm({ chosenLocale }: { chosenLocale?: string }) {
  const router = useRouter()
  const t = useTranslations('web.login')
  const common = useTranslations('web.common')
  // 規約とポリシーの頁は表示言語に従う(legalPath が唯一の決め手)。
  const locale = matchLocale([useLocale()])
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [foreignTransferAccepted, setForeignTransferAccepted] = useState(false)
  const [busyProvider, setBusyProvider] = useState<SsoProvider | null>(null)
  const [failed, setFailed] = useState(false)

  const consented = termsAccepted && foreignTransferAccepted

  // Safari が 1 回目の popup を止めないよう、ボタンを押す前に SDK を用意しておく(lib/firebase/browser.ts の prepareSso)。
  // SDK は用意の時に Firebase と Google の API へ接続するので、2 つの同意が付いた後に限る(プライバシーポリシー第 5 条 3 項)。
  useEffect(() => {
    if (consented) prepareLogin()
  }, [consented])
  const busy = busyProvider !== null

  const onSso = (provider: SsoProvider) => {
    if (!consented || busy) return
    setBusyProvider(provider)
    setFailed(false)
    // popup の遮断を避けるため、クリックの処理の中で await を挟まずに呼ぶ。
    loginWithSso(provider, chosenLocale)
      .then((outcome) => {
        if (outcome.kind === 'done') {
          // 遷移を待つ間はボタンを二度押させない(busy のまま)
          router.replace(outcome.next)
          return
        }
        setBusyProvider(null)
        if (outcome.kind === 'failed') setFailed(true)
      })
      .catch(() => {
        setBusyProvider(null)
        setFailed(true)
      })
  }

  // `.qs-lg`(page.tsx)の flex の列の子として、hero → 同意 → 余白 → ボタンの順に並ぶ(FREEZE ① の L2)。
  return (
    <>
      <div className="qs-hero">
        <h1 className="qs-h1">
          {asLines(t.raw('heading')).map((phrase, i) => (
            <Fragment key={phrase}>
              {i > 0 && <wbr />}
              <span className="nw">{phrase}</span>
            </Fragment>
          ))}
        </h1>
        <p className="qs-lede">
          <JpText text={asLines(t.raw('lede'))} />
        </p>
      </div>

      {/* 同意の文は句読点の後だけで折る(所有者 2026-11-04)。1 つ目は読点を使わず 1 行に入れる(案 A)。 */}
      <div data-login-consent className="qs-cons">
        <label className="qs-cr" data-login-consent-row>
          <input
            type="checkbox"
            name="termsAccepted"
            checked={termsAccepted}
            disabled={busy}
            onChange={(event) => setTermsAccepted(event.target.checked)}
          />
          <span>
            {t.rich('consentTerms', {
              ph: (chunks) => <span className="qs-ph">{chunks}</span>,
              terms: (chunks) => (
                <Link href={legalPath(locale, 'terms')} onClick={(event) => event.stopPropagation()}>{chunks}</Link>
              ),
              privacy: (chunks) => (
                <Link href={legalPath(locale, 'privacy')} onClick={(event) => event.stopPropagation()}>{chunks}</Link>
              ),
            })}
          </span>
        </label>
        <label className="qs-cr" data-login-consent-row>
          <input
            type="checkbox"
            name="foreignTransferAccepted"
            checked={foreignTransferAccepted}
            disabled={busy}
            onChange={(event) => setForeignTransferAccepted(event.target.checked)}
          />
          <span>
            <JpText text={t('consentForeign')} />
          </span>
        </label>
      </div>

      {/* 注釈(案 B)。※ は読み上げに出さず、本文だけを読む。折りは固定せず、句ごとに nowrap・句の間に wbr。 */}
      <div className="qs-notes">
        {asLineGroups(t.raw('notes')).map((phrases) => (
          <p key={phrases[0]} className="qs-note">
            <span className="m" aria-hidden="true">{t('noteMark')}</span>
            {phrases.map((phrase, i) => (
              <Fragment key={phrase}>
                {i > 0 && <wbr />}
                <span className="nw">{phrase}</span>
              </Fragment>
            ))}
          </p>
        ))}
      </div>

      <div className="qs-gx" />

      <div data-login-sso className="qs-sso-s">
        <SsoButton
          provider="apple"
          disabled={!consented || busy}
          busy={busyProvider === 'apple'}
          onClick={() => onSso('apple')}
        />
        <SsoButton
          provider="google"
          disabled={!consented || busy}
          busy={busyProvider === 'google'}
          onClick={() => onSso('google')}
        />
        {failed && <ActionError lines={asLines(common.raw('errorTryLater'))} />}
      </div>
    </>
  )
}
