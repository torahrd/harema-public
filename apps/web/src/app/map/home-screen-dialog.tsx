'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { JpText } from '../_ui/jp-text'

/**
 * ホーム画面に追加する案内のモーダル(地図を開いた時・Android の Chrome だけ)。
 * 器・置き方は退会のダイアログ(account/withdraw-dialog.tsx)、チェックボックスはログインの同意の行(.qs-cr)、
 * ボタンは .qs-btn-p / .qs-btn-s の縦の並び(.qs-dlg-col)。新しい値は 2 つだけ(design/DESIGN.md 問い 2):
 * 見出しの上の余白 0(上に「取り消せません」の札を置かないため)・チェックボックスの行の上の余白 8。
 * 「開いているときだけ mount される」前提。onAdd は `prompt()` を呼ぶ側(クリックの処理の中で呼ぶ)。
 */
export function HomeScreenDialog({
  onAdd,
  onCancel,
}: {
  onAdd: (neverShowAgain: boolean) => void
  onCancel: (neverShowAgain: boolean) => void
}) {
  const t = useTranslations('web.homeScreen')
  const common = useTranslations('web.common')
  const [never, setNever] = useState(false)
  return (
    <>
      <div
        aria-hidden="true"
        className="qs qs-scrim"
        onClick={() => onCancel(never)}
        style={{ position: 'absolute', inset: 0, zIndex: 50 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-screen-dialog-heading"
        aria-describedby="home-screen-dialog-body"
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
        <h3 id="home-screen-dialog-heading" className="qs-dlg-h" style={{ marginTop: 0 }}>
          {t('title')}
        </h3>
        <div id="home-screen-dialog-body">
          <p className="qs-dlg-b">
            <JpText text={t('body1')} />
          </p>
          <p className="qs-dlg-b">
            <JpText text={t('body2')} />
          </p>
        </div>
        <label className="qs-cr" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={never} onChange={(event) => setNever(event.target.checked)} />
          <span>{t('never')}</span>
        </label>
        <div className="qs-dlg-col">
          <button type="button" className="qs-btn qs-btn-p" onClick={() => onAdd(never)}>
            {t('add')}
          </button>
          <button type="button" className="qs-btn qs-btn-s" onClick={() => onCancel(never)}>
            {common('cancel')}
          </button>
        </div>
      </div>
    </>
  )
}
