'use client'

import {
  DELETE_CONFIRM_CANCEL,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  deleteConfirmBody,
} from './save-sheet-copy'
import { BODY, heading } from '../text-styles'
import { JpText } from '../_ui/jp-text'

/**
 * D5(design C-3 = WP-08-save-detail-flow.html / 面 6 = WP-10-place-detail.html)。見出しと
 * 2 ボタンは C-3 のまま不変、本文だけ店名の有無で分かれる(店名が空の POI は面 6 の版)。
 * 逐語は save-sheet-copy.ts の 1 箇所で読む(計画 §8.2)。
 *
 * S1(保存/編集シート・zIndex 20/21)の上に重ねるので、この対だけ更に上の層を使う。スクリムの
 * クリックはキャンセルへ倒す(S1 自身の背景タップ挙動と揃え、確定はボタン以外では起きない
 * ——キャンセル方向にしか倒れないので不可逆性を損なわない)。`pending` の間はスクリムも
 * ボタンも操作を受け付けない(削除が進行中のダイアログを引っ込めて二重送信の温床にしない)。
 */
export function DeleteConfirmDialog({
  displayName,
  pending,
  onCancel,
  onConfirm,
}: {
  displayName: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => {
          if (!pending) onCancel()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 30,
          background: 'var(--dlg-scrim)',
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-heading"
        aria-describedby="delete-confirm-body"
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 31,
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-card)',
          padding: '24px 22px',
          boxShadow: 'var(--dlg-shadow)',
        }}
      >
        <h3
          id="delete-confirm-heading"
          style={{
            ...heading(20),
            color: 'var(--fg-1)',
            margin: '0 0 10px',
          }}
        >
          {DELETE_CONFIRM_TITLE}
        </h3>
        <p
          id="delete-confirm-body"
          style={{
            ...BODY,
            color: 'var(--fg-2)',
            margin: 0,
          }}
        >
          <JpText text={deleteConfirmBody(displayName)} />
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={onCancel}
            style={{
              flex: 1,
              justifyContent: 'center',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {DELETE_CONFIRM_CANCEL}
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
            {DELETE_LABEL}
          </button>
        </div>
      </div>
    </>
  )
}
