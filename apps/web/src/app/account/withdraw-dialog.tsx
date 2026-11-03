'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SignInProvider } from '@/lib/auth/core'
import type { SsoProvider } from '@/lib/auth/browser-flow'
import { ActionError } from '../_auth-ui/action-error'
import { SsoButton } from '../_auth-ui/sso-button'
import {
  DIALOG_CANCEL,
  IRREVERSIBLE_NOTICE,
  WITHDRAW_DIALOG_BODY_LINES,
  WITHDRAW_DIALOG_TITLE,
  WITHDRAW_ERROR,
  withdrawReauthLines,
} from './drawer-copy'
import { prepareWithdraw, reauthenticateAndWithdraw } from './withdraw-client'

/**
 * E-4 退会確認ダイアログ(login-replace の FREEZE: compare-v3 の ③ の「新」)。
 * `map/delete-confirm-dialog.tsx` を造形の型にする(スクリム + 中央ダイアログ・`role`・`aria-*`・
 * `.btn`・`pending` 中は操作不可)。「開いているときだけ mount される」前提(open prop は持たない)。
 *
 * 見た目はデザインシステム Quiet Signal(globals.css 7.・スクリムは ink の 40%・影なし)。
 *
 * 本人の確認と退会は 1 つのダイアログで済む: ログインに使った事業者(Apple / Google)のボタンを押すと、
 * popup で入り直し(auth_time が新しい ID トークン)、Apple だけ取り消し、`POST /auth/withdraw` へ渡す
 * (withdraw-client.ts)。成功は 200 でサーバが cookie を消すので、クライアントが LP(/)へ遷移する。
 * popup を閉じただけなら何も出さず戻る。失敗はボタンの下に 1 つの表示だけ(印を書けず何も消えていない = やり直せる)。
 * 事業者が分からないとき(ID トークンに載っていない)は、2 つのボタンを並べる(違う事業者で入ると
 * サーバが sub の不一致で拒む)。
 */
export function WithdrawDialog({
  provider,
  onCancel,
}: {
  provider: SignInProvider | null
  onCancel: () => void
}) {
  const router = useRouter()
  const [pendingProvider, setPendingProvider] = useState<SsoProvider | null>(null)
  const [failed, setFailed] = useState(false)
  const pending = pendingProvider !== null
  // Safari が 1 回目の popup を止めないよう、ダイアログが開いた時に SDK を用意しておく(lib/firebase/browser.ts の prepareSso)
  useEffect(() => {
    prepareWithdraw()
  }, [])
  const providers: readonly SsoProvider[] = provider === null ? ['apple', 'google'] : [provider]
  const reauthLines = withdrawReauthLines(provider)

  const onReauth = (target: SsoProvider) => {
    if (pending) return
    setPendingProvider(target)
    setFailed(false)
    // popup の遮断を避けるため、クリックの処理の中で await を挟まずに呼ぶ。
    reauthenticateAndWithdraw(target)
      .then((outcome) => {
        if (outcome.kind === 'done') {
          // 遷移を待つ間はボタンを二度押させない(pending のまま)
          router.replace('/')
          return
        }
        if (outcome.kind === 'unauthenticated') {
          router.replace('/login')
          return
        }
        setPendingProvider(null)
        if (outcome.kind === 'failed') setFailed(true)
      })
      .catch(() => {
        setPendingProvider(null)
        setFailed(true)
      })
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="qs qs-scrim"
        onClick={() => {
          if (!pending) onCancel()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="withdraw-dialog-heading"
        aria-describedby="withdraw-dialog-body"
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
        <p className="qs-nt">
          <span className="qs-bar" aria-hidden="true" />
          {IRREVERSIBLE_NOTICE}
        </p>
        <h3 id="withdraw-dialog-heading" className="qs-dlg-h">
          {WITHDRAW_DIALOG_TITLE}
        </h3>
        <div id="withdraw-dialog-body">
          <p className="qs-dlg-b">
            {WITHDRAW_DIALOG_BODY_LINES.map((line) => (
              <span key={line} className="qs-ln">
                {line}
              </span>
            ))}
          </p>
          <p className="qs-dlg-b" data-withdraw-reauth-note>
            <span className="qs-ln">{reauthLines[0]}</span>
            {reauthLines[1]}
          </p>
        </div>
        <div className="qs-dlg-col">
          {providers.map((target) => (
            <SsoButton
              key={target}
              provider={target}
              disabled={pending}
              busy={pendingProvider === target}
              onClick={() => onReauth(target)}
            />
          ))}
          <button
            type="button"
            className="qs-btn qs-btn-s"
            disabled={pending}
            onClick={onCancel}
          >
            {DIALOG_CANCEL}
          </button>
        </div>
        {failed && <ActionError lines={WITHDRAW_ERROR} />}
      </div>
    </>
  )
}
