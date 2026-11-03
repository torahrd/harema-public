'use client'

import { useRouter } from 'next/navigation'
import { startTransition } from 'react'
import { ERROR_COPY } from './error-copy'

/**
 * 500(spec §5)。root layout の下で起きた例外 —— 例えば /map の Server Component が
 * 取得失敗を throw したもの —— をここが受ける。
 *
 * **エラーの内容(message / stack / digest)は画面に出さない**(spec §6.1 の確定「エラーの
 * 内容はクライアントへ出さず固定文言のみ」)。報告先のサービスを持たないので `console.error`
 * も置かない —— 出す先が無いログは、開発者ツールに例外を二重に流すだけになる。
 *
 * 造形は not-found.tsx と同型(前例 = login の箱・H1_STYLE・.caption-lead / .whisper /
 * .btn-hairline)。アクションは「再試行」1 つだけ(中身は下の retry)。
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

export default function Error({ reset }: { reset: () => void }) {
  const router = useRouter()

  /**
   * `reset()` は境界の状態を消して配下を再レンダするだけで、Server Component を取り直さない ——
   * 500 の原因はサーバ側の取得失敗なので、これだけでは同じ結果が返って 500 面のまま留まる
   * (WP-13 実測:押しても Places へのリクエストが 1 本も出なかった)。取り直しは
   * `router.refresh()` が担い、同じ transition に入れて画面の差し替えを 1 回にまとめる。
   * Next 16 が内部で持つ retry(`startTransition(() => { refresh(); reset() })`)と同じ手順を、
   * 公開 API だけで組む —— boundary が渡す `unstable_retry` は名前のとおり不安定で、改名されれば
   * `onClick` が undefined になり、いま直しているのと同じ「押しても何も起きない」に無言で戻る。
   */
  const retry = () => {
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <main style={MAIN_STYLE}>
      <div style={BODY_STYLE}>
        <span className="caption-lead">{ERROR_COPY.eyebrow}</span>
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
        {ERROR_COPY.action} <span className="arrow">→</span>
      </button>
    </main>
  )
}
