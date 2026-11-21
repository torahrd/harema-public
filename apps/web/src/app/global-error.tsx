'use client'

import { useRouter } from 'next/navigation'
import { startTransition } from 'react'
import { matchLocale, messages } from '@harema/shared/i18n'
import './globals.css'

/**
 * root layout 自身が落ちたときの最後の受け皿(spec §5)。root layout ごと置き換わるので、
 * `<html>` / `<body>` と CSS を自前で持つ(Next 16 の要件)。
 *
 * `next/font` は足さない —— `--ff-sans` 等のトークンの var() に代わりの値
 * (`var(--font-noto-sans, 'Noto Sans')` の形)があり、到達可能性が極めて低いこの 1 枚のために
 * 依存を増やす理由が無い。この `<html>` には next/font の変数が無いので、代わりの値が無いと
 * 宣言ごと無効になりブラウザ既定(iOS では明朝)に落ちる(app-qs)。
 * `.edge-tint` の 2 枚も置かない(最小版のため。外観の切り替えに伴うバーの色の追従はこの 1 枚では扱わない)。
 *
 * 文言は error.tsx と同じ辞書(web.error.failed・web.common.retry)から取る(eyebrow だけ持たない最小版)。
 * root layout ごと置き換わって next-intl の provider が無いので、辞書を直に引く。
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

  // 置き換わる前の <html lang> を引き継ぐ(許可リストの値だけ)。
  const lang = typeof document === 'undefined' ? 'ja' : matchLocale([document.documentElement.lang])
  const web = messages[lang].web

  return (
    <html lang={lang} suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <main style={MAIN_STYLE}>
          <div style={BODY_STYLE}>
            <h1 style={H1_STYLE}>
              {web.error.failed.heading[0]}
              <br />
              {web.error.failed.heading[1]}
            </h1>
            <p className="whisper" style={LEDE_STYLE}>
              {web.error.failed.lede}
            </p>
          </div>

          <button type="button" className="btn-hairline" onClick={retry}>
            {web.common.retry}
          </button>
        </main>
      </body>
    </html>
  )
}
