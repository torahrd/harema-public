'use client'

import { useTranslations } from 'next-intl'
import { META } from '../text-styles'

/**
 * 地図のチュール(検索欄の下の列)に出す知らせの器(点 + 文 + 閉じる ×)。
 * 位置情報の帯(`location-permission-banner.tsx`)の外枠を、値を変えずに切り出したもの。
 * 位置情報の帯と、店の無いリストで絞った時の知らせ(単位 lists-filter-carry)が使う。
 * `children` は文の欄(META・`--fg-1`)の中身。
 */
export function MapNoticeCard({
  onDismiss,
  children,
}: {
  onDismiss: () => void
  children: React.ReactNode
}) {
  const common = useTranslations('web.common')
  return (
    <div
      style={{
        // 位置はチュールの縦リズム(固定行 → gap:9)が決める。絶対配置で固定行の下へ重ねると、
        // 同じ帯を使うサジェストパネルを覆ってしまう(1 件目が押せなくなる)。左右 12 も
        // チュールの padding が持つ。z は据え置き(検索スクリム 2 の上・トースト 16 の下)。
        position: 'relative',
        zIndex: 11,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '12px 14px',
        boxShadow: 'var(--shadow-2)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
          flex: 'none',
          marginTop: 6,
        }}
      />
      <div
        style={{
          flex: 1,
          ...META,
          color: 'var(--fg-1)',
        }}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={common('close')}
        style={{
          flex: 'none',
          display: 'flex',
          marginTop: 2,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg-muted)"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12 M18 6l-12 12" />
        </svg>
      </button>
    </div>
  )
}
