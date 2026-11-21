import Link from 'next/link'
import { NOT_FOUND_EYEBROW } from '@/app/error-copy'

/** 画面に出す文言。(site) は日本語の辞書、(app) は表示言語の辞書から渡す。 */
export type NotFoundViewCopy = { heading: readonly string[]; lede: string; action: string }

/**
 * 404(spec §5「独立画面を設けないもの」の Next 標準 3 ファイルのうち 1 枚)。root に置くので、
 * `notFound()` の呼び出しと、どのルートにも一致しない URL の両方をここが受ける。
 *
 * 造形は既存の前例だけで組む —— 箱は login/page.tsx の `<main>`、見出しの寸法は
 * login-form.tsx の H1_STYLE、eyebrow / 本文 / CTA は globals.css の
 * `.caption-lead` / `.whisper` / `.btn-hairline`。新しいトークン・クラス・余白値は作らない。
 *
 * Server Component なので、アクションは `<Link>`(= `<a>`)で書く。
 */

/** login/page.tsx の `<main>` と同型。 */
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

/** login-form.tsx の `<form>`(見出しの塊を上に、CTA を下端に置く)と同型。 */
const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  marginTop: 64,
}

/** 見出しの寸法。app-qs で 32px・行送り 1.5 に揃えた(login は .qs の別系統)。 */
const H1_STYLE: React.CSSProperties = {
  fontSize: 32,
  lineHeight: 1.5,
  letterSpacing: '0.01em',
  fontFeatureSettings: '"palt"',
  margin: '28px 0 0',
}

/** 本文の上限幅。login 状態2 の本文と同じ 37ch(文の自然幅 + 余白)。 */
const LEDE_STYLE: React.CSSProperties = { margin: '16px 0 0', maxWidth: '37ch' }

/** `homeHref`: 戻る先。英語の公開ページの 404 は `/en`、それ以外は `/`。 */
export default function NotFoundView({ copy, homeHref = '/' }: { copy: NotFoundViewCopy; homeHref?: string }) {
  return (
    <main style={MAIN_STYLE}>
      <div style={BODY_STYLE}>
        <span className="caption-lead">{NOT_FOUND_EYEBROW}</span>
        <h1 style={H1_STYLE}>
          {copy.heading[0]}
          <br />
          {copy.heading[1]}
        </h1>
        <p className="whisper" style={LEDE_STYLE}>
          {copy.lede}
        </p>
      </div>

      {/* 公開 LP へ戻る。 */}
      <Link className="btn-hairline" href={homeHref}>
        {copy.action} <span className="arrow">→</span>
      </Link>
    </main>
  )
}
