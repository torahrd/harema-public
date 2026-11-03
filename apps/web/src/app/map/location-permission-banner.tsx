'use client'

import { useEffect, useRef, useState } from 'react'
import { META } from '../text-styles'

/**
 * 位置情報が拒否されているときのバナー(design B-5 逐語)。既定エリア(東京駅)表示のまま
 * 検索・保存は可能で、これは現在地表示ができない旨の告知。金ドット + × で閉じられる。
 */

// 句ごとに 1 つの inline-block。Safari(WebKit)は字体の読み込みと幅しだいで語中
// ("端末の設 / 定から")で折るので、折り位置を句の切れ目に決める(所有者 2026-11-02「改行位置が
// おかしいのは直して」)。入る幅では句が並び、入らない幅では句ごと次の行へ落ちる。各句は
// バナーの最小幅(320px 時 225px)に収まるので、内部では折れない。文言は design B-5 逐語のまま。
const LOCATION_DENIED_MESSAGE = [
  '位置情報がオフです。',
  '現在地の表示には、',
  '端末の設定から許可が必要です。',
] as const

// 端末側で許可へ変えたあと、リロードなしでバナーを畳むための手動契機(⑨)。
const LOCATION_RETRY_LABEL = '許可したら、もう一度試す'

// 再試行しても変わらないときの次の一手(裁定 2026-07-31)。読ませるだけで、タップ可能にしない。
// 節ごとに 1 つの inline-block。WebKit は語中("してください / 。")で折るので、折り位置を版面に
// 委ねずここで決める —— 2 節が字の欄に入る幅では 1 行に並び、入らない幅では節ごと次の行へ
// 落ちる(所有者 2026-11-02 R-3a 案 C の並べ方)。字は Quiet Signal の META(13px・字間 0.02em)
// なので 2 節で約 332px になり、幅 430 では 1 行、402 の iPhone 17(字の欄 約 307px)以下では 2 行
// (12px にはしない・所有者 2026-11-02 の決定カード A)。各節はバナーの最小幅(320px 時 225px)に
// 収まるので、内部では折れない。
const LOCATION_RELOAD_HINT = [
  '変わらないときは、',
  'ページを再読み込みしてください。',
] as const

export function LocationPermissionBanner({
  onDismiss,
  onRetry,
  retrying,
}: {
  onDismiss: () => void
  onRetry: () => void
  retrying: boolean
}) {
  // 再試行が終わってもこのバナーが残っている = 失敗。成功した場合は親が 'granted' へ移して
  // バナーごとアンマウントするので、ここには到達しない。一度出したら消さない —— 押すたびに
  // 出入りするとちらつくので、バナーが畳まれる(成功 / ×)まで残す。
  const [reloadHintShown, setReloadHintShown] = useState(false)
  const wasRetryingRef = useRef(retrying)
  useEffect(() => {
    if (wasRetryingRef.current && !retrying) setReloadHintShown(true)
    wasRetryingRef.current = retrying
  }, [retrying])

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
        {LOCATION_DENIED_MESSAGE.map((phrase) => (
          <span key={phrase} style={{ display: 'inline-block' }}>
            {phrase}
          </span>
        ))}
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          style={{
            // 本文の下に自分の行を持つ(親は非 flex なので block レベルの flex にする)。
            display: 'flex',
            width: 'fit-content',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: retrying ? 'default' : 'pointer',
            opacity: retrying ? 0.5 : 1,
            ...META,
            color: 'var(--accent)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {LOCATION_RETRY_LABEL}
          {retrying && <span className="spinner" aria-hidden="true" />}
        </button>
        {reloadHintShown && (
          <span style={{ display: 'block', marginTop: 8 }}>
            {LOCATION_RELOAD_HINT.map((clause) => (
              <span key={clause} style={{ display: 'inline-block' }}>
                {clause}
              </span>
            ))}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="閉じる"
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
