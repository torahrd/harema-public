'use client'

import { useRouter } from 'next/navigation'
import { startTransition } from 'react'
import { ERROR_COPY } from './error-copy'
import './globals.css'

/**
 * root layout 自身が落ちたときの最後の受け皿(spec §5)。root layout ごと置き換わるので、
 * `<html>` / `<body>` と CSS を自前で持つ(Next 16 の要件)。
 *
 * `next/font` は足さない —— `--ff-sans` 等のトークンの var() に代わりの値
 * (`var(--font-noto-sans, 'Noto Sans')` の形)があり、到達可能性が極めて低いこの 1 枚のために
 * 依存を増やす理由が無い。この `<html>` には next/font の変数が無いので、代わりの値が無いと
 * 宣言ごと無効になりブラウザ既定(iOS では明朝)に落ちる(app-qs)。
 * `.edge-tint` の 2 枚も置かない(spec §7 に「実測で効かない残置物」と記録済み)。
 *
 * 文言は error.tsx と同じ定数から取る(eyebrow だけ持たない最小版)。
 */

const MAIN_STYLE: React.CSSProperties = {
  flex: 1,
  width: '100%',
  maxWidth: '27rem',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 28px 28px',
  paddingTop: 'max(16px, env(safe-area-inset-top))',
}

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  marginTop: 64,
}

const H1_STYLE: React.CSSProperties = {
  fontSize: 32,
  lineHeight: 1.5,
  letterSpacing: '0.01em',
  fontFeatureSettings: '"palt"',
  margin: '28px 0 0',
}

const LEDE_STYLE: React.CSSProperties = { margin: '16px 0 0', maxWidth: '37ch' }

export default function GlobalError({ reset }: { reset: () => void }) {
  const router = useRouter()

  // 再試行の中身は error.tsx と同じ(理由はそちらに書いた)。この 1 枚は root layout ごと
  // 置き換わるが、**router の外に出るわけではない** —— Next 16 は global-error の境界を
  // AppRouterContext.Provider の内側に置く(`app-router` が providers → RootErrorBoundary →
  // content の順に組む)ので、ここでも `useRouter()` は解決する。
  const retry = () => {
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <main style={MAIN_STYLE}>
          <div style={BODY_STYLE}>
            <h1 style={H1_STYLE}>
              {ERROR_COPY.heading[0]}
              <br />
              {ERROR_COPY.heading[1]}
            </h1>
            <p className="whisper" style={LEDE_STYLE}>
              {ERROR_COPY.lede}
            </p>
          </div>

          <button type="button" className="btn-hairline" onClick={retry}>
            {ERROR_COPY.action}
          </button>
        </main>
      </body>
    </html>
  )
}
