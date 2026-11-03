'use client'

import { BODY, heading } from '../text-styles'

/**
 * 面 10(Maps JS 本体そのものが読み込めなかった。design `WP-10-place-detail.html:598-619` /
 * handoff `:42`)。文言は承認済み design の逐語(計画 §8.2)。「再試行」は Maps JS の bootstrap
 * script を読み直す唯一の手段としてページを再読込する —— このライブラリは失敗した読み込みを
 * ソフトに再試行する公開 API を持たない(`useApiLoadingStatus` / `useApiIsLoaded` のみ公開)。
 * 地図画面と一覧の地図(saved/saved-list-map.tsx)が同じカードを使う。
 */
const MAPS_LOAD_FAIL_TITLE = 'いま、地図を表示できませんでした'
const MAPS_LOAD_FAIL_BODY = '少し待って、もう一度読み込んでください。'
const MAPS_LOAD_FAIL_RETRY = '再試行'

export function MapsLoadFailCard() {
  return (
    // 位置・寸法・影は既存のオフライン面カード(offline-overlay.tsx)と同一(design 自身が
    // 「chrome の扱いはオフライン面 B-4 に揃え」と指示する。handoff `:42`)。
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
        {MAPS_LOAD_FAIL_TITLE}
      </h3>
      <p
        style={{
          ...BODY,
          color: 'var(--fg-2)',
          margin: 0,
        }}
      >
        {MAPS_LOAD_FAIL_BODY}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {MAPS_LOAD_FAIL_RETRY}
        </button>
      </div>
    </div>
  )
}
