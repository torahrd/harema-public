'use client'

/**
 * 「現在地に戻る」ボタン(右下・design B-1 / 無効時 B-4・B-5 の造形を逐語)。
 * 有効 = surface + 中央ドット、無効(位置拒否 / オフライン)= bg-sunken + opacity .55・中央ドットなし。
 */
export function CurrentLocationButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="現在地に戻る"
      style={{
        position: 'absolute',
        right: 16,
        bottom: 'calc(env(safe-area-inset-bottom) + 20px)',
        width: 46,
        height: 46,
        borderRadius: 'var(--radius-control)',
        background: disabled ? 'var(--bg-sunken)' : 'var(--surface)',
        border: `1px solid ${disabled ? 'var(--border-subtle)' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: disabled ? 'none' : 'var(--shadow-1)',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
        zIndex: 15,
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={disabled ? 'var(--fg-muted)' : 'var(--fg-2)'}
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="7" />
        <path d="M12 1.5v3.4 M12 19.1v3.4 M1.5 12h3.4 M19.1 12h3.4" />
        {!disabled && <circle cx="12" cy="12" r="2.5" fill="var(--fg-2)" stroke="none" />}
      </svg>
    </button>
  )
}
