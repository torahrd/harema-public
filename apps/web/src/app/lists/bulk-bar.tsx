'use client'

import { useTranslations } from 'next-intl'
import { bulkActionsEnabled, type BulkBarButton } from '@/lib/lists/list-selection'

/**
 * 一覧で「選ぶ」の間、画面の一番下に出る帯。縦に 2 段(段の間 10)。見ている所で出すボタンが変わる
 * (`bulkBarRows`: 「すべて」の上段は「リストに入れる」だけ・リストで絞っている時は「リストに入れる」「リストから外す」・
 * 下段は「状態を変える」「削除する」)。
 * 余白 12px 20px 14px・上の罫 1px `--border`・ボタンは `.btn` を段の中に横に(間 10・`flex: 1`・中央)。「削除する」だけ字が `--akane-text`。
 * 0 件の間と送信中(`busy`)は不透明度 0.5 で押せない。所有者の決定(2026-11-25 12:12 JST・harema#152)。
 */
export function BulkBar({
  rows,
  selectedCount,
  busy,
  onAdd,
  onRemove,
  onStatus,
  onDelete,
}: {
  rows: readonly (readonly BulkBarButton[])[]
  selectedCount: number
  busy: boolean
  onAdd: () => void
  onRemove: () => void
  onStatus: () => void
  onDelete: () => void
}) {
  const t = useTranslations('web.lists')
  const common = useTranslations('web.saveSheet')
  const enabled = bulkActionsEnabled(selectedCount) && !busy
  const handlers: Record<BulkBarButton, () => void> = {
    add: onAdd,
    remove: onRemove,
    status: onStatus,
    delete: onDelete,
  }
  const labels: Record<BulkBarButton, string> = {
    add: t('bulkAdd'),
    remove: t('bulkRemove'),
    status: t('bulkStatus'),
    delete: common('deleteLabel'),
  }
  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 20px 14px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      {rows.map((row) => (
        <div key={row.join('-')} style={{ display: 'flex', gap: 10 }}>
          {row.map((button) => (
            <button
              key={button}
              type="button"
              className="btn"
              data-testid={`bulk-${button}`}
              disabled={!enabled}
              onClick={handlers[button]}
              style={{
                flex: 1,
                justifyContent: 'center',
                ...(button === 'delete' ? { color: 'var(--akane-text)' } : null),
                ...(enabled ? null : { opacity: 0.5, cursor: 'default' }),
              }}
            >
              {labels[button]}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
