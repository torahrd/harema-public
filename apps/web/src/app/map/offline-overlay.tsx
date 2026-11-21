'use client'

import { useTranslations } from 'next-intl'
import { BODY, heading } from '../text-styles'

/**
 * オフライン状態(design B-4 逐語)。地図を減光し、中央にカードを出す。検索・現在地は
 * map-screen 側で disabled 造形になる。「再試行」と `online` イベントで復帰する。
 */

export function OfflineOverlay({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('web.map.offline')
  const common = useTranslations('web.common')
  return (
    <>
      {/* 地図の減光(design は MapBg opacity .38。実地図は不透明なので bg 面を被せて近似する)。 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          background: 'color-mix(in srgb, var(--bg) 62%, transparent)',
          pointerEvents: 'none',
        }}
      />
      <div
        role="alert"
        style={{
          position: 'absolute',
          left: 34,
          right: 34,
          top: '46%',
          transform: 'translateY(-50%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '24px 22px',
          zIndex: 8,
          textAlign: 'center',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <h3 style={{ ...heading(20), margin: '0 0 8px', color: 'var(--fg-1)' }}>
          {t('title')}
        </h3>
        <p
          style={{
            ...BODY,
            color: 'var(--fg-2)',
            margin: 0,
          }}
        >
          {t('body')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button type="button" className="btn" onClick={onRetry}>
            {common('retry')}
          </button>
        </div>
      </div>
    </>
  )
}
