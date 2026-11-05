'use client'

import {
  panelContent,
  suggestionRows,
  type SuggestionBucket,
} from '@harema/shared/search-scope'
import { JpText } from '../_ui/jp-text'
import type { SearchMode } from './types'
import type {
  ClassifiedSuggestion,
  GroupedSuggestions,
} from './use-autocomplete-suggestions'
import { BODY, META } from '../text-styles'

/**
 * 候補の枠。検索中だけ、一番上の行に「飲食店以外を検索結果に含める」のスイッチを出す(行全体が
 * 押せる 1 つのボタン)。オフ(`store`)は飲食だけ、オン(`map`)は飲食と場所を見出しなしで Google の
 * 順のまま 1 列に混ぜ、場所の行にだけ注記を添える。候補の name / address は表示専用(DB へ送らない)。
 * 行が 0 件でもスイッチの行は出す(オフで地名を打つと飲食が 0 件になり、枠ごと消すとスイッチに
 * 辿り着けないため)。`onModeChange` が無い呼び出し(スイッチ無し)は行が無ければ何も描かない。
 */

/** 文言(所有者 2026-11-05 02:50 / 02:38)。 */
const SWITCH_LABEL = '飲食店以外を検索結果に含める'
const LOCATION_NOTE = '※マップが移動します。保存はできません。'

/**
 * スイッチの色(所有者の決定 2026-11-05 03:00・design3/DESIGN.md「決定」)。色を書くのはここだけ。
 * オン = 墨の塗り + 地の色のつまみ / オフ = 地の色の面 + 細い罫 + 罫と影つきのつまみ。
 */
const SWITCH_COLORS = {
  onTrack: 'var(--fg-1)',
  surface: 'var(--surface)',
  offBorder: 'var(--switch-off-border)',
  thumbShadow: 'var(--switch-thumb-shadow)',
} as const

type SearchSuggestionsProps = {
  mode: SearchMode
  suggestions: GroupedSuggestions
  onSelect: (item: ClassifiedSuggestion, bucket: SuggestionBucket) => void
  /** あればスイッチの行を出す(地図の画面だけが渡す)。 */
  onModeChange?: (mode: SearchMode) => void
}

export function SearchSuggestions({
  mode,
  suggestions,
  onSelect,
  onModeChange,
}: SearchSuggestionsProps) {
  const rows = suggestionRows(mode, suggestions)
  const content = panelContent({
    hasSwitch: onModeChange !== undefined,
    rowCount: rows.length,
  })
  if (content === 'none') return null

  return (
    <Panel>
      {onModeChange !== undefined && (
        <SwitchRow
          checked={mode === 'map'}
          withBorder={content === 'rows'}
          onToggle={() => onModeChange(mode === 'map' ? 'store' : 'map')}
        />
      )}
      {content === 'rows' &&
        rows.map(({ item, bucket }, index) => (
          <SuggestionRow
            key={item.placeId}
            item={item}
            withBorder={index < rows.length - 1}
            note={bucket === 'location'}
            onSelect={() => onSelect(item, bucket)}
          />
        ))}
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

function SwitchRow({
  checked,
  withBorder,
  onToggle,
}: {
  checked: boolean
  withBorder: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        minHeight: 48,
        padding: '0 14px',
        textAlign: 'left',
        background: SWITCH_COLORS.surface,
        border: 0,
        borderBottom: withBorder ? '1px solid var(--border-subtle)' : undefined,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          ...META,
          fontWeight: 400,
          color: 'var(--fg-1)',
          whiteSpace: 'nowrap',
        }}
      >
        {SWITCH_LABEL}
      </span>
      {/* 絵のスイッチ 51×31・角 16・つまみ 25(読み上げは上のボタンの role=switch が担う) */}
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          flex: 'none',
          boxSizing: 'border-box',
          width: 51,
          height: 31,
          borderRadius: 16,
          background: checked ? SWITCH_COLORS.onTrack : SWITCH_COLORS.surface,
          border: `1px solid ${checked ? 'transparent' : SWITCH_COLORS.offBorder}`,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            boxSizing: 'border-box',
            width: 25,
            height: 25,
            borderRadius: '50%',
            background: SWITCH_COLORS.surface,
            border: checked ? 0 : `1px solid ${SWITCH_COLORS.offBorder}`,
            boxShadow: checked ? 'none' : SWITCH_COLORS.thumbShadow,
          }}
        />
      </span>
    </button>
  )
}

function SuggestionRow({
  item,
  withBorder,
  note,
  onSelect,
}: {
  item: ClassifiedSuggestion
  withBorder: boolean
  /** 飲食店以外の行にだけ注記を添える。 */
  note: boolean
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
      {note && (
        <div style={{ ...META, color: 'var(--fg-muted)', marginTop: 2 }}>
          <JpText text={LOCATION_NOTE} />
        </div>
      )}
    </button>
  )
}
