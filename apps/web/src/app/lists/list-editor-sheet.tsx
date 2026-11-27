'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { LIST_ICON_MAX_LENGTH, LIST_NAME_MAX_LENGTH } from '@harema/shared/constants'
import { isListIcon, listNameSchema } from '@harema/shared/validations'
import { LABEL_JA, META } from '../text-styles'
import { createList, deleteList, updateList } from './list-actions'
import { ListDeleteDialog } from './list-delete-dialog'
import { SheetFrame, type SheetFrameApi } from './list-sheet'
import type { ListItem } from './types'

/**
 * 名前とアイコンのシート(作る・変える・消す)。作る時は題 = 「新しいリスト」・主のボタン = 「作成する」。
 * 変える時は題 = 「リストを編集」・「更新する」・「削除する」(確認のダイアログを通す)。
 * 書きは Server Action(`list-actions.ts`)。上限(`LIST_MAX_PER_USER`)を超える作成は `web.lists.limit` をシートの中に出す。
 * 取り直しは Server Action の `revalidatePath` に任せ、`router.refresh()` は呼ばない。
 * 重なりは `zBase`(シート = zBase + 1・削除の確認 = zBase + 10 + 1)。
 * アイコンは 1 文字(絵文字・漢字・かな・英数。所有者の決定 2026-11-16 19:27 JST・harema#152)。空 = アイコンなし。
 */

const FOCUS_RING = '0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent)'

type ListEditorSheetProps = {
  zBase: number
  /** 変える時は今のリスト。作る時は省略。 */
  list?: ListItem
  onCreated?: (list: ListItem) => void
  onUpdated?: (list: ListItem) => void
  onDeleted?: (listId: string) => void
  /** 退場の後に呼ぶ。 */
  onClosed: () => void
}

export function ListEditorSheet({
  zBase,
  list,
  onCreated,
  onUpdated,
  onDeleted,
  onClosed,
}: ListEditorSheetProps) {
  const router = useRouter()
  const t = useTranslations('web.lists')
  const sheet = useTranslations('web.saveSheet')
  const common = useTranslations('web.common')
  const [name, setName] = useState(list?.name ?? '')
  const [iconText, setIconText] = useState(list?.icon ?? '')
  const [iconFocused, setIconFocused] = useState(false)
  const [iconComposing, setIconComposing] = useState(false)
  const [iconRejected, setIconRejected] = useState(false)
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'limit' | 'failed' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const iconValid = iconText === '' || isListIcon(iconText)
  const icon = iconText === '' ? null : iconText
  // 変換中は判定せず補足のまま。確定の後に判定する。サーバが拒んだ時(ブラウザとサーバの判定が割れた時)も同じ文を出す。
  const showIconError = (!iconValid && !iconComposing) || iconRejected
  const canSave = listNameSchema.safeParse(name).success && iconValid
  const editing = list !== undefined

  const submit = async (api: SheetFrameApi) => {
    if (busy || !canSave) return
    setBusy(true)
    setError(null)
    setIconRejected(false)
    try {
      if (list) {
        const result = await updateList({ listId: list.id, name, icon })
        if (result.ok) {
          onUpdated?.({ ...list, name: name.trim(), icon })
          api.close()
          return
        }
        if (result.reason === 'unauthenticated') {
          router.replace('/login')
          return
        }
        if (result.reason === 'invalid_input' && icon !== null) {
          setIconRejected(true)
          return
        }
      } else {
        const result = await createList({ name, icon })
        if (result.ok) {
          onCreated?.(result.list)
          api.close()
          return
        }
        if (result.reason === 'unauthenticated') {
          router.replace('/login')
          return
        }
        if (result.reason === 'invalid_input' && icon !== null) {
          setIconRejected(true)
          return
        }
        if (result.reason === 'limit') {
          setError('limit')
          return
        }
      }
      setError('failed')
    } catch {
      setError('failed')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async (api: SheetFrameApi) => {
    if (!list || deleting) return
    setDeleting(true)
    try {
      const result = await deleteList({ listId: list.id })
      if (result.ok) {
        setConfirmOpen(false)
        onDeleted?.(list.id)
        api.close()
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      setConfirmOpen(false)
      setError('failed')
    } catch {
      setConfirmOpen(false)
      setError('failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <SheetFrame
      zBase={zBase}
      title={editing ? t('editTitle') : t('newList')}
      onClosed={onClosed}
      holdBaseline
      lockClose={busy || deleting}
      overlay={(api) =>
        confirmOpen && list ? (
          <ListDeleteDialog
            zBase={zBase + 10}
            name={list.name}
            pending={deleting}
            onCancel={() => {
              if (!deleting) setConfirmOpen(false)
            }}
            onConfirm={() => void confirmDelete(api)}
          />
        ) : null
      }
      footer={(api) => (
        <>
          {error !== null && (
            <p role="alert" style={{ margin: '0 0 12px', ...META, color: 'var(--akane-text)' }}>
              {error === 'limit' ? t('limit') : common('actionError')}
            </p>
          )}
          <button
            type="button"
            className="btn-hairline"
            onClick={() => void submit(api)}
            disabled={busy || !canSave}
            aria-busy={busy}
            style={busy || !canSave ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            {editing ? sheet('ctaEdit') : t('create')}{' '}
            {busy ? <span className="spinner" aria-hidden="true" /> : <span className="arrow">→</span>}
          </button>
          {editing && (
            <button
              type="button"
              className="btn"
              disabled={busy || deleting}
              onClick={() => setConfirmOpen(true)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                justifyContent: 'center',
                marginTop: 10,
                color: 'var(--akane-text)',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {sheet('deleteLabel')}
            </button>
          )}
        </>
      )}
    >
      {() => (
        <div style={{ opacity: busy ? 0.5 : 1 }}>
          <label
            htmlFor="list-editor-name"
            style={{ display: 'block', ...LABEL_JA, margin: '4px 0 8px' }}
          >
            {t('nameLabel')}
          </label>
          <input
            id="list-editor-name"
            className="sheet-field"
            type="text"
            autoComplete="off"
            value={name}
            disabled={busy}
            placeholder={t('namePlaceholder')}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setName([...event.target.value].slice(0, LIST_NAME_MAX_LENGTH).join(''))
              if (error !== null) setError(null)
            }}
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              border: `1px solid ${focused ? 'var(--border-accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-control)',
              padding: '11px 12px',
              fontFamily: 'var(--ff-sans)',
              // 16px は iOS がフォーカス時に自動ズームしない下限。
              fontSize: 16,
              color: 'var(--fg-1)',
              background: 'var(--surface)',
              outline: 'none',
              boxShadow: focused ? FOCUS_RING : 'none',
              transition: 'border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)',
            }}
          />
          <p style={{ margin: '7px 0 0', ...META, color: 'var(--fg-2)' }}>{t('nameHelp')}</p>
          <label
            htmlFor="list-editor-icon"
            style={{ display: 'block', ...LABEL_JA, margin: '16px 0 8px' }}
          >
            {t('iconLabel')}
          </label>
          <input
            id="list-editor-icon"
            className="sheet-field"
            type="text"
            autoComplete="off"
            value={iconText}
            disabled={busy}
            aria-invalid={showIconError}
            onFocus={() => setIconFocused(true)}
            onBlur={() => {
              setIconFocused(false)
              setIconComposing(false)
            }}
            onCompositionStart={() => setIconComposing(true)}
            onCompositionEnd={() => setIconComposing(false)}
            onChange={(event) => {
              setIconRejected(false)
              setIconText(
                [...event.target.value].slice(0, LIST_ICON_MAX_LENGTH).join('').trim(),
              )
              if (error !== null) setError(null)
            }}
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              border: `1px solid ${iconFocused ? 'var(--border-accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-control)',
              padding: '11px 12px',
              fontFamily: 'var(--ff-sans)',
              fontSize: 16,
              color: 'var(--fg-1)',
              background: 'var(--surface)',
              outline: 'none',
              boxShadow: iconFocused ? FOCUS_RING : 'none',
              transition: 'border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)',
            }}
          />
          {!showIconError ? (
            <p style={{ margin: '7px 0 12px', ...META, color: 'var(--fg-2)' }}>{t('iconHelp')}</p>
          ) : (
            <p role="alert" style={{ margin: '7px 0 12px', ...META, color: 'var(--akane-text)' }}>
              {t('iconError')}
            </p>
          )}
        </div>
      )}
    </SheetFrame>
  )
}
