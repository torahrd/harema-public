'use client'

import { useState } from 'react'
import { DIALOG_CANCEL } from '../account/drawer-copy'
import { JpText } from '../_ui/jp-text'
import {
  HOME_DIALOG_ADD,
  HOME_DIALOG_BODY_1,
  HOME_DIALOG_BODY_2,
  HOME_DIALOG_NEVER,
  HOME_DIALOG_TITLE,
} from './home-screen-copy'

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
          {HOME_DIALOG_TITLE}
        </h3>
        <div id="home-screen-dialog-body">
          <p className="qs-dlg-b">
            <JpText text={HOME_DIALOG_BODY_1} />
          </p>
          <p className="qs-dlg-b">
            <JpText text={HOME_DIALOG_BODY_2} />
          </p>
        </div>
        <label className="qs-cr" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={never} onChange={(event) => setNever(event.target.checked)} />
          <span>{HOME_DIALOG_NEVER}</span>
        </label>
        <div className="qs-dlg-col">
          <button type="button" className="qs-btn qs-btn-p" onClick={() => onAdd(never)}>
            {HOME_DIALOG_ADD}
          </button>
          <button type="button" className="qs-btn qs-btn-s" onClick={() => onCancel(never)}>
            {DIALOG_CANCEL}
          </button>
        </div>
      </div>
    </>
  )
}
