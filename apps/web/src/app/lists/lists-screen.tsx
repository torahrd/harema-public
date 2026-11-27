'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { FullViewportShell } from '@/app/full-viewport-shell'
import { pathWithList } from '@/lib/lists/list-filter-url'
import { resolveSelectedList, type ListWithCount } from '@/lib/lists/list-selection'
import { NUM, heading } from '../text-styles'
import { ListEditorSheet } from './list-editor-sheet'
import { IconSlot, ROW_STYLE } from './list-sheet'
import type { ListItem } from './types'

/**
 * 「リスト」の画面(web だけ・`/lists`)。リストを作る・名前とアイコンを変える・消す所。地図のメニューの「リスト」から開く。
 * 頭は一覧(`saved/saved-list-screen.tsx`)の頭と同じ値(高さ 52・間 12・余白 0 16px・戻る 36×36・題 heading(18))、
 * 行は名前とアイコンのシートの行(`ROW_STYLE`・`IconSlot`)、店の数の札は一覧のタブの件数の札と同じ値(配線のテストが両方を照らす)。
 * 一番上が「+ 新しいリスト」の行、その下に自分のリストの行(作った順・最後の行だけ下に罫)。
 * 行を押すと名前とアイコンのシート(作る・更新する・削除する)。閉じるとこの画面に戻り、行の値はサーバの描き直し(Server Action の
 * `revalidatePath('/lists')`)で新しくなる(`router.refresh()` は呼ばない)。地図・Places は使わない。
 * 本体は、行が画面に入りきらない時だけ縦に動く(頭は動かない)。
 * 単位 lists-screen(所有者の決定 2026-11-25 20:21 JST・harema#152 のコメント 7160942619)。
 */

type ListsScreenProps = {
  lists: readonly ListWithCount[]
  /** 地図で絞っていたリストの id(uuid の形の時だけ。自分のリストに無ければ戻りでは引き継がない)。 */
  carriedListId: string | null
}

const ARROW = '→'

export function ListsScreen({ lists, carriedListId }: ListsScreenProps) {
  const t = useTranslations('web.lists')
  const saved = useTranslations('web.savedList')
  // 名前とアイコンのシート。list が無い = 作る。null = 閉じている。
  const [editor, setEditor] = useState<{ list?: ListItem } | null>(null)

  return (
    <FullViewportShell>
      <header
        style={{
          flex: 'none',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
        }}
      >
        <Link
          href={pathWithList('/map', resolveSelectedList(carriedListId, lists))}
          aria-label={saved('backToMap')}
          style={{
            flex: 'none',
            width: 36,
            height: 36,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-1)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 style={{ ...heading(18), color: 'var(--fg-1)', margin: 0 }}>{t('label')}</h1>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px' }}>
        <button
          type="button"
          onClick={() => setEditor({})}
          style={{ ...ROW_STYLE, justifyContent: 'space-between' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden style={{ flex: 'none', width: 28, textAlign: 'center' }}>
              +
            </span>
            <span>{t('newList')}</span>
          </span>
          <span aria-hidden>{ARROW}</span>
        </button>
        {lists.map((list, index) => (
          <button
            key={list.id}
            type="button"
            data-testid="list-row"
            onClick={() =>
              setEditor({
                list: { id: list.id, name: list.name, icon: list.icon, created_at: list.created_at },
              })
            }
            style={{
              ...ROW_STYLE,
              justifyContent: 'space-between',
              borderBottom: index === lists.length - 1 ? '1px solid var(--border-subtle)' : undefined,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <IconSlot icon={list.icon} />
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{list.name}</span>
            </span>
            <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  ...NUM,
                  fontSize: 11,
                  lineHeight: '16px',
                  color: 'var(--fg-2)',
                  background: 'var(--bg-sunken)',
                  borderRadius: 'var(--radius-chip)',
                  padding: '1px 6px',
                }}
              >
                {list.placeCount}
              </span>
              <span aria-hidden>{ARROW}</span>
            </span>
          </button>
        ))}
      </div>

      {editor !== null && (
        <ListEditorSheet zBase={20} list={editor.list} onClosed={() => setEditor(null)} />
      )}
    </FullViewportShell>
  )
}
