import Link from 'next/link'

export const BACK_TO_TOP_LABEL = 'トップへ戻る'

/** LP のトップ(`/`)へ戻る道。履歴でなく `/` に固定する(login-back・所有者 2026-11-04 案 1)。 */
export function BackToTop() {
  return (
    <Link href="/" aria-label={BACK_TO_TOP_LABEL} className="back-top">
      <span className="back-top-box">
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg-1)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>
    </Link>
  )
}
