'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { takeLpNotice, type LpNoticeKind } from '@/lib/lp-notice'
import { LP_NOTICE_CLOSE_LABEL, LP_NOTICE_LINES } from './lp-notice-copy'
import './lp-notice.css'

// 初めの描画は常に null(サーバの HTML と同じ)。mount の後に印を読み、あれば出す。
// 1 回だけ・戻ると閉じる・StrictMode の 2 回目の effect の振る舞いは単体テストで守れていない(node:test は部品を描かない)。
// 変えたら、build + start の上で印を置いて再読み込み・× ・再読み込み・pageshow(persisted) を確かめ直す。
// 確かめ直しの台本は /mnt/project-files/harema/logout-to-lp/scripts/t-br.cjs(build + start を 3998 番で起こしてから node で実行)。
// 印は networkidle の後 500ms 待ってから置く(load の直後だと、前の頁の effect が印を読んで消すことがある)。
// ログアウトの後は同じ文書の中の移動で LP が mount される(文書の読み直しではない)。印を読むのを文書の読み込みのときだけにしない。
export function LpNotice() {
  const [kind, setKind] = useState<LpNoticeKind | null>(null)
  const taken = useRef<{ kind: LpNoticeKind | null } | null>(null)

  useEffect(() => {
    // StrictMode の 2 回目の effect でも値を失わないよう、未設定のときだけ読む。
    taken.current ??= { kind: takeLpNotice() }
    const found = taken.current.kind
    let cancelled = false
    if (found) {
      queueMicrotask(() => {
        if (!cancelled) setKind(found)
      })
    }
    // 戻る(bfcache の復元)では出さない。
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setKind(null)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      cancelled = true
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  if (kind === null) return null
  const lines = LP_NOTICE_LINES[kind]
  return (
    <div className="lp-in">
      <div role="status" className="lp-ntc hd">
        <span className="lp-ntc-ck">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lp-signal)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
        </span>
        <span className="lp-ntc-t">
          {lines.map((line, i) => (
            <Fragment key={line}>
              {i > 0 ? <wbr /> : null}
              {line}
            </Fragment>
          ))}
        </span>
        <button type="button" className="lp-ntc-x" aria-label={LP_NOTICE_CLOSE_LABEL} onClick={() => setKind(null)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--lp-fg2)" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  )
}
