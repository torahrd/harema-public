'use client'

import { useEffect, useState } from 'react'
import { getPlaceDetails } from '@/lib/places/details-cache'
import {
  DETAIL_ENTERPRISE_FETCH_FAIL,
  DETAIL_PANEL_HOURS_CAPTION,
  DETAIL_PANEL_MISSING,
  DETAIL_PANEL_PHONE_CAPTION,
  DETAIL_PANEL_WEBSITE_CAPTION,
  DETAIL_ROW_LABEL,
  EXTERNAL_ARROW,
} from '@/app/places/[id]/place-detail-copy'
import { createEnterpriseOnce } from './place-details-once'
import { isHttpUrl } from '@/lib/external-link'
import { BODY, LABEL_JA, META, NUM } from '../text-styles'

/** 展開マスク(Enterprise SKU)で取れる 3 値。`weekdayDescriptions` は畳まず 1 要素 1 行で持つ。 */
type EnterpriseDetails = {
  weekdayDescriptions: string[] | null
  nationalPhoneNumber: string | null
  websiteURI: string | null
}

/** 展開パネルの見出し(design `.sd-pcap`)。letter-spacing が .14em で本文の見出し(.16em)とは別値。 */
const PANEL_CAPTION_STYLE: React.CSSProperties = { ...LABEL_JA, marginBottom: 5 }

/** 展開パネルの「値が無い」表示(design `.sd-nil`)。 */
const PANEL_NIL_STYLE: React.CSSProperties = { ...META, color: 'var(--fg-muted)' }

const CHEVRON_PATH = 'M6 9l6 6 6-6'
const CHEVRON_OPEN_PATH = 'M18 15l-6-6-6 6'

type PlaceDetailsDisclosureProps = {
  /** Places ライブラリ。null の間(未解決・読み込み失敗)は行を押せない(追加リクエストを出させない)。 */
  places: google.maps.PlacesLibrary | null
  googlePlaceId: string
  /** 行を開いた・閉じた時に呼ぶ(地図から開いた S1 が、開いた時だけ下の余白を広げるため)。 */
  onExpandedChange?: (expanded: boolean) => void
}

/**
 * 「詳細情報（営業時間・電話・website）」の行と枠(店舗詳細と地図から開いた S1 が同じ部品を描く)。
 * 行と枠を並べて返す(fragment)ので、親の縦の列(`gap`)の中の並びは単独で書いた時と同じ。
 * Enterprise マスクは行を押した時のハンドラの 1 か所だけで取る(1 マウント 1 回・折りたたみ → 再展開は
 * 取り直さない。ガードは place-details-once.ts)。effect はアンマウントの印を立てるだけで取得を始めない
 * (折りたたみ中に届いた応答を捨てない AD-D1・StrictMode の再生で応答を捨て続けない CR-DIFF-002)。
 */
export function PlaceDetailsDisclosure({ places, googlePlaceId, onExpandedChange }: PlaceDetailsDisclosureProps) {
  const [once] = useState(createEnterpriseOnce)
  const [expanded, setExpanded] = useState(false)
  const [enterpriseData, setEnterpriseData] = useState<EnterpriseDetails | undefined>(undefined)
  const [enterpriseFailed, setEnterpriseFailed] = useState(false)

  useEffect(() => {
    once.mount()
    return () => {
      once.unmount()
    }
  }, [once])

  const onClick = () => {
    const next = !expanded
    setExpanded(next)
    onExpandedChange?.(next)
    if (!next || places === null) return
    once.start(
      async (): Promise<EnterpriseDetails | null> => {
        // 展開マスクはこの 3 つだけ(配列リテラルで直書きする)。
        const place = await getPlaceDetails(places, googlePlaceId, [
          'regularOpeningHours',
          'nationalPhoneNumber',
          'websiteURI',
        ])
        return {
          weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions ?? null,
          nationalPhoneNumber: place.nationalPhoneNumber ?? null,
          websiteURI: place.websiteURI ?? null,
        }
      },
      (result) => {
        // 新しい面を作らない —— 失敗は固定 1 文だけを出す。値欄の「—」とは混同させない。自動リトライしない。
        if (result.kind === 'ok') setEnterpriseData(result.value)
        else setEnterpriseFailed(true)
      },
    )
  }

  return (
    <>
      {/* 展開(営業時間・電話・website。design 面 3/4/5/9・計画 §8 S4)。ライブラリ不在
          (未解決・読み込み失敗のいずれも)は disabled にし、追加リクエストを出させない
          (確定事項 2026-08-24。fg-muted + opacity .55、毛細線・padding・行の高さは変えず、
          シェブロンは幾何を保って残す)。サイト(website)は WP-10.5 で復旧し見出しは 3 つ。 */}
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        disabled={places === null}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'transparent',
          border: 0,
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: expanded ? 0 : '1px solid var(--border-subtle)',
          padding: expanded ? '15px 0 4px' : '15px 0',
          ...BODY,
          color: places === null ? 'var(--fg-muted)' : 'var(--fg-1)',
          cursor: places === null ? 'default' : 'pointer',
          textAlign: 'left',
          opacity: places === null ? 0.55 : 1,
        }}
      >
        <span>{DETAIL_ROW_LABEL}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={
            places === null ? 'var(--fg-muted)' : expanded ? 'var(--accent)' : 'var(--fg-2)'
          }
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={expanded ? CHEVRON_OPEN_PATH : CHEVRON_PATH} />
        </svg>
      </button>

      {expanded &&
        (enterpriseFailed ? (
          // 既存の上部一時エラー型を再利用する 1 文だけ(design にコマは無い = handoff U5)。
          <div
            style={{
              ...BODY,
              color: 'var(--fg-2)',
            }}
          >
            {DETAIL_ENTERPRISE_FETCH_FAIL}
          </div>
        ) : enterpriseData === undefined ? (
          // 取得中(design 面 5)。見出しは先に出し、値の位置だけ帯にする。
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_HOURS_CAPTION}</div>
              <div className="saved-skeleton-bar" style={{ width: '66%', height: 9 }} />
              <div
                className="saved-skeleton-bar"
                style={{ width: '34%', height: 9, marginTop: 6 }}
              />
            </div>
            <div>
              <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_PHONE_CAPTION}</div>
              <div className="saved-skeleton-bar" style={{ width: '44%', height: 9 }} />
            </div>
            <div>
              <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_WEBSITE_CAPTION}</div>
              <div className="saved-skeleton-bar" style={{ width: '72%', height: 9 }} />
            </div>
          </div>
        ) : (
          // 届いた(design 面 3/4/5/9)。器の形は変えない —— 3 見出しは常に出し、無い値は
          // DETAIL_PANEL_MISSING。営業時間は weekdayDescriptions を順序・文言不変で 1 要素 1 行のまま出す
          // (整形器を書かない・曜日を畳まない。確定事項 2026-08-24)。
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_HOURS_CAPTION}</div>
              {enterpriseData.weekdayDescriptions &&
              enterpriseData.weekdayDescriptions.length > 0 ? (
                <div
                  style={{
                    ...META,
                    color: 'var(--fg-1)',
                  }}
                >
                  {enterpriseData.weekdayDescriptions.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : (
                <div style={PANEL_NIL_STYLE}>{DETAIL_PANEL_MISSING}</div>
              )}
            </div>
            <div>
              <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_PHONE_CAPTION}</div>
              {enterpriseData.nationalPhoneNumber ? (
                <div style={{ ...NUM, fontSize: 13, lineHeight: '20px', color: 'var(--fg-1)' }}>
                  {enterpriseData.nationalPhoneNumber}
                </div>
              ) : (
                <div style={PANEL_NIL_STYLE}>{DETAIL_PANEL_MISSING}</div>
              )}
            </div>
            <div>
              <div style={PANEL_CAPTION_STYLE}>{DETAIL_PANEL_WEBSITE_CAPTION}</div>
              {/* 長い URL は折り返さず末尾省略する(人間裁定 2026-08-28)。<a> をインライン
                  のまま置くと nowrap / overflow / text-overflow が効かない(第 5 巡裁定が
                  CSS 仕様から確定)ので display:'block' に載せる。href は取得値そのまま
                  (素通し・再構成しない)。 */}
              {enterpriseData.websiteURI && isHttpUrl(enterpriseData.websiteURI) ? (
                <a
                  href={enterpriseData.websiteURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    ...META,
                    color: 'var(--fg-1)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {enterpriseData.websiteURI}
                  {' '}
                  {EXTERNAL_ARROW}
                </a>
              ) : (
                <div style={PANEL_NIL_STYLE}>{DETAIL_PANEL_MISSING}</div>
              )}
            </div>
          </div>
        ))}
    </>
  )
}
