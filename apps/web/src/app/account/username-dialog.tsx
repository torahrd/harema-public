'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  hasForbiddenUsernameCharacter,
  usernameSchema,
} from '@harema/shared/validations'
import {
  ACTION_ERROR,
  CURRENT_LABEL,
  DIALOG_CANCEL,
  INVISIBLE_CHAR_ERROR,
  USERNAME_DIALOG_TITLE,
  USERNAME_NEW_LABEL,
  USERNAME_PLACEHOLDER,
  USERNAME_SUBMIT,
} from './drawer-copy'
import { updateUsername } from './actions'
import { BODY, LABEL_JA, META, heading } from '../text-styles'

/**
 * E-1 ユーザー名変更ダイアログ(design `hareMa アカウントフロー.dc.html`・etag
 * `1785977989176170`)。`map/delete-confirm-dialog.tsx` を造形の型にする(スクリム + 中央ダイアログ・
 * `role`・`aria-*`・`.btn`・`pending` 中は操作不可)。「開いているときだけ mount される」前提
 * (open prop は持たない)。
 *
 * 不可視文字判定・スキーマは `packages/shared/validations`(Onboarding と単一の真実源)。IME 変換中
 * (compositionstart〜end)は Enter 送信を止める(`onboarding-form.tsx` の `isComposingRef` と同型)。
 */
export function UsernameDialog({
  currentUsername,
  onClose,
}: {
  currentUsername: string
  onClose: () => void
}) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isComposingRef = useRef(false)

  const hasForbidden = hasForbiddenUsernameCharacter(value)
  const canSubmit = usernameSchema.safeParse(value).success

  const submit = async () => {
    if (pending || !canSubmit) return
    setPending(true)
    setError(null)
    try {
      const result = await updateUsername({ username: value })
      if (result.ok) {
        router.refresh()
        onClose()
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      setError(ACTION_ERROR)
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => {
          if (!pending) onClose()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          background: 'var(--dlg-scrim)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-dialog-heading"
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 51,
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-card)',
          padding: '24px 22px',
          boxShadow: 'var(--dlg-shadow)',
        }}
      >
        <h3
          id="username-dialog-heading"
          style={{
            ...heading(20),
            color: 'var(--fg-1)',
            margin: '0 0 14px',
          }}
        >
          {USERNAME_DIALOG_TITLE}
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              ...LABEL_JA,
            }}
          >
            {CURRENT_LABEL}
          </span>
          <span
            style={{
              ...BODY,
              color: 'var(--fg-1)',
            }}
          >
            {currentUsername}
          </span>
        </div>
        <label
          htmlFor="username-dialog-input"
          style={{
            display: 'block',
            ...LABEL_JA,
            marginBottom: 8,
          }}
        >
          {USERNAME_NEW_LABEL}
        </label>
        <input
          id="username-dialog-input"
          value={value}
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isComposingRef.current) {
              event.preventDefault()
              void submit()
            }
          }}
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={USERNAME_PLACEHOLDER}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            padding: '11px 12px',
            fontFamily: 'var(--ff-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
            background: 'var(--surface)',
          }}
        />
        {hasForbidden && (
          <p
            role="alert"
            style={{
              margin: '8px 0 0',
              ...META,
              color: 'var(--akane-text)',
            }}
          >
            {INVISIBLE_CHAR_ERROR.map((sentence) => (
              <span key={sentence} style={{ display: 'block' }}>
                {sentence}
              </span>
            ))}
          </p>
        )}
        {error && (
          <p
            role="alert"
            style={{
              margin: '12px 0 0',
              ...META,
              color: 'var(--akane-text)',
            }}
          >
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={onClose}
            style={{
              flex: 1,
              justifyContent: 'center',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {DIALOG_CANCEL}
          </button>
          <button
            type="button"
            className="btn-solid"
            disabled={pending || !canSubmit}
            aria-busy={pending}
            onClick={() => void submit()}
            style={{
              flex: 1,
              cursor: pending || !canSubmit ? 'default' : 'pointer',
            }}
          >
            {USERNAME_SUBMIT}
          </button>
        </div>
      </div>
    </>
  )
}
