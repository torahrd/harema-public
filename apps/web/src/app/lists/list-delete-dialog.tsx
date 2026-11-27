'use client'

import { useTranslations } from 'next-intl'
import { JpText } from '../_ui/jp-text'
import { BODY, heading } from '../text-styles'

/**
 * リストの削除の確認(店の削除の確認 `map/delete-confirm-dialog.tsx` と同じ値の器。文は `web.lists.deleteConfirm*`)。
 * 外側を押すとキャンセル。`pending` の間はスクリムもボタンも操作を受け付けない。重なりは `zBase`(スクリム = zBase・本体 = zBase + 1)。
 * 仮の決定(所有者の再確認待ち・harema#152)。
 */
export function ListDeleteDialog({
  zBase,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  zBase: number
  name: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('web.lists')
  const sheet = useTranslations('web.saveSheet')
  const common = useTranslations('web.common')
  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => {
          if (!pending) onCancel()
        }}
        style={{ position: 'absolute', inset: 0, zIndex: zBase, background: 'var(--dlg-scrim)' }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="list-delete-heading"
        aria-describedby="list-delete-body"
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: zBase + 1,
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-card)',
          padding: '24px 22px',
          boxShadow: 'var(--dlg-shadow)',
        }}
      >
        <h3
          id="list-delete-heading"
          style={{ ...heading(20), color: 'var(--fg-1)', margin: '0 0 10px' }}
        >
          {t('deleteConfirmTitle')}
        </h3>
        <p id="list-delete-body" style={{ ...BODY, color: 'var(--fg-2)', margin: 0 }}>
          <JpText text={t('deleteConfirmBody', { name })} />
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={onCancel}
            style={{ flex: 1, justifyContent: 'center', cursor: pending ? 'default' : 'pointer' }}
          >
            {common('cancel')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
            style={{
              flex: 1,
              justifyContent: 'center',
              color: 'var(--akane-text)',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {sheet('deleteLabel')}
          </button>
        </div>
      </div>
    </>
  )
}
