'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { SavedPlaceStatus } from '@harema/shared/constants'
import { statusChoices } from '@/lib/lists/list-selection'
import { META } from '../text-styles'
import { IconSlot, ROW_STYLE, SheetFrame } from './list-sheet'

/**
 * 一括の「状態を選ぶ」段(一覧の「選ぶ」の帯の「状態を変える」から)。器はリストのシートと同じ `SheetFrame`(footer なし)、
 * 行は `ROW_STYLE`(高さ 56)で、左に幅 28 の空の枠(`IconSlot`)。今のタブの状態と、評価済みのタブでの「行きたい」は押せない
 * (`--fg-muted`・不透明度 0.5・`disabled`。1 件ずつの編集と同じ決まり)。今のタブの行の右に「今の状態」。
 * 評価済みのタブでは、行の下に注記(`web.saveSheet.statusRevertNote`・META・`--fg-2`・上 7)。
 * 押した瞬間に閉じ始め、退場の間(240ms)の 2 回目の押下では送らない(`ListSheet` の apply と同じ)。
 * 所有者の決定(2026-11-25 12:12 JST・harema#152)。
 */
export function StatusPickSheet({
  zBase,
  current,
  onPick,
  onClosed,
}: {
  zBase: number
  /** 今のタブの状態。 */
  current: SavedPlaceStatus
  onPick: (status: SavedPlaceStatus) => void
  /** 退場の後に呼ぶ。 */
  onClosed: () => void
}) {
  const t = useTranslations('web.lists')
  const sheet = useTranslations('web.saveSheet')
  const statusNames = useTranslations('savedPlaceStatus')
  const pickedRef = useRef(false)
  const { choices, showRevertNote } = statusChoices(current)
  return (
    <SheetFrame zBase={zBase} title={t('statusPickTitle')} hideTitle onClosed={onClosed}>
      {(api) => (
        <div>
          {choices.map((choice) => (
            <button
              key={choice.status}
              type="button"
              data-testid={`status-pick-${choice.status}`}
              disabled={!choice.enabled}
              onClick={() => {
                if (pickedRef.current) return
                pickedRef.current = true
                onPick(choice.status)
                api.close()
              }}
              style={{
                ...ROW_STYLE,
                justifyContent: 'space-between',
                ...(choice.enabled
                  ? null
                  : { color: 'var(--fg-muted)', opacity: 0.5, cursor: 'default' }),
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconSlot icon={null} />
                <span>{statusNames(choice.status)}</span>
              </span>
              {choice.current && <span style={META}>{t('statusCurrent')}</span>}
            </button>
          ))}
          {showRevertNote && (
            <p style={{ margin: '7px 0 0', ...META, color: 'var(--fg-2)' }}>
              {sheet('statusRevertNote')}
            </p>
          )}
        </div>
      )}
    </SheetFrame>
  )
}
