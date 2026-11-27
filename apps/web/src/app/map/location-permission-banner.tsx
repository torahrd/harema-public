'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { asLines } from '@/i18n/lines'
import { META } from '../text-styles'
import { MapNoticeCard } from './map-notice-card'

/**
 * 位置情報が拒否されているときのバナー(design B-5 逐語)。既定エリア(東京駅)表示のまま
 * 検索・保存は可能で、これは現在地表示ができない旨の告知。金ドット + × で閉じられる。
 */

// 文言は辞書(web.map.locationBanner)。denied は先頭が 1 文目、残りが 2 文目の句の並び。
// 句ごとに 1 つの inline-block。Safari(WebKit)は字体の読み込みと幅しだいで語中
// ("端末の設 / 定から")で折るので、折り位置を句の切れ目に決める(所有者 2026-11-02「改行位置が
// おかしいのは直して」)。入る幅では句が並び、入らない幅では句ごと次の行へ落ちる。各句は
// バナーの最小幅(320px 時 225px)に収まるので、内部では折れない。文言は design B-5 逐語のまま。
// retry: 端末側で許可へ変えたあと、リロードなしでバナーを畳むための手動契機(⑨)。

// reloadHint: 再試行しても変わらないときの次の一手(裁定 2026-07-31)。読ませるだけで、タップ可能にしない。
// 節ごとに 1 つの inline-block。WebKit は語中("してください / 。")で折るので、折り位置を版面に
// 委ねずここで決める —— 2 節が字の欄に入る幅では 1 行に並び、入らない幅では節ごと次の行へ
// 落ちる(所有者 2026-11-02 R-3a 案 C の並べ方)。字は Quiet Signal の META(13px・字間 0.02em)
// なので 2 節で約 332px になり、幅 430 では 1 行、402 の iPhone 17(字の欄 約 307px)以下では 2 行
// (12px にはしない・所有者 2026-11-02 の決定カード A)。各節はバナーの最小幅(320px 時 225px)に
// 収まるので、内部では折れない。

export function LocationPermissionBanner({
  onDismiss,
  onRetry,
  retrying,
}: {
  onDismiss: () => void
  onRetry: () => void
  retrying: boolean
}) {
  const t = useTranslations('web.map.locationBanner')
  const denied = asLines(t.raw('denied'))
  const reloadHint = asLines(t.raw('reloadHint'))
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
    <MapNoticeCard onDismiss={onDismiss}>
      {/*
        文の切れ目「。」の後で必ず行を変える(所有者 2026-11-03 17:44 JST・デザインシステムの和文の
        「行は句読点の後で終える」)。1 文目は 1 行。2 文目は句ごとの塊で、入る幅では 1 行に並び、
        入らない幅では句の切れ目「、」の後で折れる。字は META のまま変えない。
      */}
      {[denied.slice(0, 1), denied.slice(1)].map((sentence) => (
        <span key={sentence.join('')} style={{ display: 'block' }}>
          {sentence.map((phrase) => (
            <span key={phrase} style={{ display: 'inline-block' }}>
              {phrase}
            </span>
          ))}
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
        {t('retry')}
        {retrying && <span className="spinner" aria-hidden="true" />}
      </button>
      {reloadHintShown && (
        <span style={{ display: 'block', marginTop: 8 }}>
          {reloadHint.map((clause) => (
            <span key={clause} style={{ display: 'inline-block' }}>
              {clause}
            </span>
          ))}
        </span>
      )}
    </MapNoticeCard>
  )
}
