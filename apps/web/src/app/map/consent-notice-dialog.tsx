'use client'

import { useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { LEGAL_NOTICE_EFFECTIVE_ON } from '@harema/shared/constants'
import { legalPath, matchLocale } from '@harema/shared/i18n'
import { asLines } from '@/i18n/lines'
import { clearLpNotice, markLpNotice } from '@/lib/lp-notice'
import { signOut } from '../account/actions'
import { ActionError } from '../_auth-ui/action-error'
import { JpText } from '../_ui/jp-text'
import { agreeToCurrentRevision } from './consent-actions'

/**
 * 改定のお知らせ(地図を開いた時・見ていないお知らせ付きの改定が適用済みの人だけ。判定は地図のガード map の page.tsx)。
 * 器・置き方・チェック・ボタンは「ホーム画面に追加」の案内(home-screen-dialog.tsx)と同じ値(新しい値は作らない)。
 * 違う点: チェックは必須(付くまで「続ける」は押せない)・スクリムを押しても閉じない。
 * 「続ける」= 記録して閉じる。失敗は閉じずに、今ある失敗の表示(ActionError)で知らせ、押し直せる。
 * 「同意しないでログアウト」= 今のログアウトと同じ動き(account/drawer.tsx の handleLogout)。
 * 「開いているときだけ mount される」前提。
 */
export function ConsentNoticeDialog({ onAgreed }: { onAgreed: () => void }) {
  const t = useTranslations('web.consentNotice')
  const login = useTranslations('web.login')
  const common = useTranslations('web.common')
  const drawer = useTranslations('web.drawer')
  // 規約とポリシーの頁は表示言語に従う(legalPath が唯一の決め手。ログイン画面・メニューと同じ)。
  const locale = matchLocale([useLocale()])
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState<'agree' | 'logout' | null>(null)
  const [error, setError] = useState<'record' | 'logout' | null>(null)

  const handleAgree = async () => {
    if (!checked || pending) return
    setPending('agree')
    setError(null)
    try {
      const result = await agreeToCurrentRevision()
      if (result.ok) {
        onAgreed()
        return
      }
    } catch {
      // 通信の失敗。閉じずに失敗を出す(押し直せる)。
    }
    setError('record')
    setPending(null)
  }

  const handleLogout = async () => {
    if (pending) return
    setPending('logout')
    setError(null)
    // 今のログアウトと同じ(drawer.tsx): 成功はサーバが cookie を消して LP へ移すので、印は呼ぶ前に置く。
    markLpNotice('logout')
    try {
      await signOut()
    } catch (e) {
      unstable_rethrow(e)
    }
    clearLpNotice()
    setError('logout')
    setPending(null)
  }

  return (
    <>
      {/* 器の外を押しても閉じない(退会の処理中と同じ扱い)。 */}
      <div
        aria-hidden="true"
        className="qs qs-scrim"
        style={{ position: 'absolute', inset: 0, zIndex: 50 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-notice-heading"
        aria-describedby="consent-notice-body"
        className="qs qs-dlg"
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          maxWidth: 354,
          marginInline: 'auto',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 51,
        }}
      >
        <h3 id="consent-notice-heading" className="qs-dlg-h" style={{ marginTop: 0 }}>
          {t('title')}
        </h3>
        <div id="consent-notice-body">
          <p className="qs-dlg-b">
            <JpText text={t('body1', { date: LEGAL_NOTICE_EFFECTIVE_ON })} />
          </p>
          <p className="qs-dlg-b">
            <JpText text={t('body2')} />
          </p>
        </div>
        {/* ログイン画面の 1 つ目の同意と同じ文・同じリンク。開いた先で地図の位置を残すため、新しいタブで開く(ドロワーの規約のリンクと同じ)。 */}
        <label className="qs-cr" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={pending !== null}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            {login.rich('consentTerms', {
              ph: (chunks) => <span className="qs-ph">{chunks}</span>,
              terms: (chunks) => (
                <a href={legalPath(locale, 'terms')} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
                  {chunks}
                </a>
              ),
              privacy: (chunks) => (
                <a href={legalPath(locale, 'privacy')} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
                  {chunks}
                </a>
              ),
            })}
          </span>
        </label>
        <div className="qs-dlg-col">
          <button
            type="button"
            className="qs-btn qs-btn-p"
            disabled={!checked || pending !== null}
            aria-busy={pending === 'agree'}
            onClick={handleAgree}
          >
            {t('continue')}
          </button>
          <button
            type="button"
            className="qs-btn qs-btn-s"
            disabled={pending !== null}
            aria-busy={pending === 'logout'}
            onClick={handleLogout}
          >
            {t('declineLogout')}
          </button>
        </div>
        {error === 'record' && <ActionError lines={asLines(common.raw('errorTryLater'))} />}
        {error === 'logout' && <ActionError lines={asLines(drawer.raw('logoutError'))} />}
      </div>
    </>
  )
}
