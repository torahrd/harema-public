'use client'

import type { SearchMode } from './types'
import type {
  ClassifiedSuggestion,
  GroupedSuggestions,
} from './use-autocomplete-suggestions'
import { BODY, LABEL_JA, META } from '../text-styles'

/**
 * サジェストパネル(design B-2 フラット / B-3 2 グループ)。店舗モードは飲食のみをフラット表示、
 * マップモードは「場所」「飲食店」の 2 グループ。候補の name / address は表示専用(DB へ送らない)。
 * 表示する候補が無ければ何も描かない(空箱を出さない)。
 */

type SearchSuggestionsProps = {
  mode: SearchMode
  suggestions: GroupedSuggestions
  onSelect: (item: ClassifiedSuggestion, bucket: 'food' | 'location') => void
}

export function SearchSuggestions({
  mode,
  suggestions,
  onSelect,
}: SearchSuggestionsProps) {
  const { food, location } = suggestions

  if (mode === 'store') {
    if (food.length === 0) return null
    return (
      <Panel>
        {food.map((item, index) => (
          <SuggestionRow
            key={item.placeId}
            item={item}
            withBorder={index < food.length - 1}
            onSelect={() => onSelect(item, 'food')}
          />
        ))}
      </Panel>
    )
  }

  const hasLocation = location.length > 0
  const hasFood = food.length > 0
  if (!hasLocation && !hasFood) return null

  return (
    <Panel>
      {hasLocation && (
        <>
          <GroupHeader label="場所" withTopBorder={false} />
          {location.map((item, index) => (
            <SuggestionRow
              key={item.placeId}
              item={item}
              withBorder={index < location.length - 1}
              onSelect={() => onSelect(item, 'location')}
            />
          ))}
        </>
      )}
      {hasFood && (
        <>
          <GroupHeader label="飲食店" withTopBorder={hasLocation} />
          {food.map((item, index) => (
            <SuggestionRow
              key={item.placeId}
              item={item}
              withBorder={index < food.length - 1}
              onSelect={() => onSelect(item, 'food')}
            />
          ))}
        </>
      )}
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        marginTop: 4,
        boxShadow: 'var(--shadow-2)',
      }}
    >
      {children}
    </div>
  )
}

function GroupHeader({
  label,
  withTopBorder,
}: {
  label: string
  withTopBorder: boolean
}) {
  return (
    <div
      style={{
        padding: '7px 14px',
        background: 'var(--bg-sunken)',
        ...LABEL_JA,
        borderTop: withTopBorder ? '1px solid var(--border-subtle)' : undefined,
      }}
    >
      {label}
    </div>
  )
}

function SuggestionRow({
  item,
  withBorder,
  onSelect,
}: {
  item: ClassifiedSuggestion
  withBorder: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        background: 'transparent',
        border: 0,
        borderBottom: withBorder ? '1px solid var(--border-subtle)' : undefined,
        cursor: 'pointer',
      }}
    >
      <div style={{ ...BODY, color: 'var(--fg-1)' }}>
        {item.mainText}
      </div>
      {item.secondaryText && (
        <div
          style={{
            ...META,
            color: 'var(--fg-2)',
            marginTop: 3,
          }}
        >
          {item.secondaryText}
        </div>
      )}
    </button>
  )
}
