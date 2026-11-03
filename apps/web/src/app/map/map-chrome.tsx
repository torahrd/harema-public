'use client'

import { useState } from 'react'
import type { SearchMode } from './types'
import { META } from '../text-styles'

/**
 * 検索チュール(design MapChrome.dc.html / B-1・B-2・B-3 を ±0 移植)。検索バー(通常 /
 * フォーカス時 border-accent / disabled)+ ハンバーガー 44×44(WP-11: 右ドロワーを開く)+
 * セグメント 188px 右寄せ(店舗 / マップ)。サジェストパネルは children で差し込む
 * (design の flex 列 gap:9 に同居させるため)。位置は上部・safe-area 追従。
 */

const SEARCH_PLACEHOLDER = '店名・場所で検索'

type MapChromeProps = {
  query: string
  onQueryChange: (value: string) => void
  /**
   * IME の変換中かどうかの通知(onboarding-form の compositionstart / end と同型)。表示は
   * 変換中も生値のまま追従させ、抑えるのは検索の発火だけなので、フラグは入力の値と分けて持つ。
   */
  onComposingChange: (composing: boolean) => void
  onSearchFocus: () => void
  onClear: () => void
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
  disabled: boolean
  /**
   * ハンバーガー(≡)。アカウント右ドロワー(WP-11・design E-0)を開く。オフライン中・Maps JS
   * 失敗中(disabled)も押せる —— ドロワーの中身(ログアウト・退会)は地図に依存しない。
   */
  onMenuClick: () => void
  /**
   * トースト(design ④・保存成功)。固定行(検索バー + セグメント)の下端に 9px でアンカーする
   * ためチュール側で位置決めする —— design の「定位置 9px」はチュームの縦リズムと同値なので、
   * 実測値のハードコードではなく同じ gap から導く。overlay として重ねるので、サジェスト
   * パネル(children)を押し下げない。
   */
  toastSlot?: React.ReactNode
  /**
   * 位置情報バナー(design B-5)。固定行とサジェストのあいだの行として列に並べる —— 重ねると
   * 同じ帯を奪い合い、下になった側(サジェスト)が押せなくなる。トーストは overlay なので
   * この行を押し下げない。検索を開いていない間は toastBelowBanner でトーストをバナーの下に置き、
   * 検索中はバナーの上に重なる(既存どおり)。
   */
  bannerSlot?: React.ReactNode
  /**
   * 真のとき、バナーが出ていればトーストをバナーの下端 + 9px に置く(所有者 2026-11-02 D13 案 C)。
   * 固定行の下に重ねると、バナーの上半分を覆い、出始めの半透明の間にバナーの字が透ける。
   * 検索を開いている間は偽にする —— 下げるとサジェストを覆うので、そのときは今の位置。
   */
  toastBelowBanner?: boolean
  children?: React.ReactNode
}

export function MapChrome({
  query,
  onQueryChange,
  onComposingChange,
  onSearchFocus,
  onClear,
  mode,
  onModeChange,
  disabled,
  onMenuClick,
  toastSlot,
  bannerSlot,
  toastBelowBanner = false,
  children,
}: MapChromeProps) {
  const anchorToBanner = toastBelowBanner && Boolean(bannerSlot)
  const toastLayer = toastSlot && (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 9,
        zIndex: 16,
      }}
    >
      {toastSlot}
    </div>
  )
  const [focused, setFocused] = useState(false)
  const active = !disabled && (focused || query.length > 0)
  const iconStroke = active ? 'var(--fg-1)' : 'var(--fg-muted)'

  return (
    /* この枠は位置決めだけを担い、z-index を持たない —— 持つとスタッキングコンテキストになり、
       中のトーストが枠の値(10)より上へ出られず、外側のバナー(11)の裏に隠れる。重ね順は中の
       3 層が地図画面のルート文脈で直接宣言する:固定行 10 / サジェスト 10 / トースト 16。 */
    <div
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top) + 8px)',
        left: 0,
        right: 0,
        padding: '0 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      {/* 固定行(検索バー + セグメント)。トーストはこの下端を基準に 9px 下へ重ねる(toastBelowBanner
          のときはバナーの下へ)。ここも
          z-index を持たない(持てば同じ理由でトーストが閉じ込められる)ので、見えている 2 行が
          それぞれ 10 を宣言する。 */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        {/* 検索バー + ハンバーガー */}
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', gap: 8 }}>
          <div
            style={{
              flex: 1,
              // WebKit は入力側の `min-width: 0` を、この親の content-based minimum
              // (`min-width: auto`)へ伝播させない。ここで 0 を置かないと親が入力の固有幅まで
              // 広がり、行からハンバーガーが押し出される(Blink は伝播するので Chrome では出ない)。
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: disabled ? 'var(--bg-sunken)' : 'var(--surface)',
              border: `1px solid ${
                disabled
                  ? 'var(--border-subtle)'
                  : active
                    ? 'var(--border-accent)'
                    : 'var(--border)'
              }`,
              borderRadius: 'var(--radius-control)',
              padding: '11px 13px',
              boxShadow: disabled ? 'none' : 'var(--shadow-1)',
              opacity: disabled ? 0.65 : 1,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={iconStroke}
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ flex: 'none' }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              className="map-search-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onCompositionStart={() => onComposingChange(true)}
              onCompositionEnd={(event) => {
                // compositionend と change の発火順はブラウザ差があるので、確定値をここでも 1 回
                // 通す(onboarding-form と同型)。同値なら再描画は起きず、発火も 1 回のまま。
                onComposingChange(false)
                onQueryChange(event.currentTarget.value)
              }}
              onFocus={() => {
                setFocused(true)
                onSearchFocus()
              }}
              onBlur={() => {
                setFocused(false)
                // 変換は focus を失った時点で終わっている。compositionend が来ないまま外れる
                // ブラウザがあると、降りないフラグが以後の検索を止め続けるのでここでも降ろす。
                onComposingChange(false)
              }}
              disabled={disabled}
              type="text"
              // 幅は flex 側が決める。既定の `size=20` は「20 文字ぶん」の固有幅を入力に与え、その
              // 1 文字幅はフォント metrics 由来なので、全角基準の JP フォントで ⑦ の 16px と噛み合うと
              // 行を溢れさせる。1 にして固有幅を font-size から切り離す。
              size={1}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={SEARCH_PLACEHOLDER}
              aria-label={SEARCH_PLACEHOLDER}
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--ff-sans)',
                // design B-2 は 14px だが、iOS Safari は 16px 未満の input に focus すると
                // 画面を自動ズームする。ズームを禁じる代わりに入力側を 16px へ上げる(裁定 2026-07-30)。
                fontSize: 16,
                color: 'var(--fg-1)',
                background: 'transparent',
                border: 0,
                borderRadius: 0,
                padding: 0,
                outline: 'none',
                caretColor: 'var(--accent)',
              }}
            />
            {query.length > 0 && !disabled && (
              <button
                type="button"
                onClick={onClear}
                aria-label="検索をクリア"
                style={{
                  flex: 'none',
                  display: 'flex',
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
            )}
          </div>

          {/* ハンバーガー: アカウント右ドロワーを開く(WP-11・design E-0)。 */}
          <button
            type="button"
            aria-label="メニュー"
            onClick={onMenuClick}
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              boxShadow: 'var(--shadow-1)',
              cursor: 'pointer',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg-1)"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M3 6h18 M3 12h18 M3 18h18" />
            </svg>
          </button>
        </div>

        {/* セグメント(店舗 / マップ)右寄せ 188px。 */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            alignSelf: 'flex-end',
            background: 'var(--bg-sunken)',
            border: `1px solid ${disabled ? 'var(--border-subtle)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-control)',
            padding: 3,
            gap: 3,
            width: 188,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <SegmentButton
            label="店舗"
            selected={mode === 'store'}
            disabled={disabled}
            onClick={() => onModeChange('store')}
          />
          <SegmentButton
            label="マップ"
            selected={mode === 'map'}
            disabled={disabled}
            onClick={() => onModeChange('map')}
          />
        </div>

        {/* 16 は地図画面のルート文脈での値。バナー(11)・現在地ボタン(15)より上、S1 の
            スクリム(20)と .edge-tint(100)より下。 */}
        {!anchorToBanner && toastLayer}
      </div>

      {bannerSlot && (
        // 位置決めだけの枠(z-index を持たない —— 持つとトーストがこの枠の値に閉じ込められる)。
        // バナーが出ている間はトーストの有無に関わらず同じ親に置く。親が入れ替わるとバナーが
        // 作り直され、一度出した追記(reloadHintShown)が消えるため。
        <div style={{ position: 'relative' }}>
          {bannerSlot}
          {anchorToBanner && toastLayer}
        </div>
      )}

      {/* サジェストは検索スクリム(2)より上に出す必要があるので、パネル側ではなくここで層を宣言
          する(チュールの重ね順を 1 ファイルに集める)。 */}
      {children && (
        <div style={{ position: 'relative', zIndex: 10 }}>{children}</div>
      )}
    </div>
  )
}

function SegmentButton({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '7px 0',
        ...META,
        fontWeight: selected ? 700 : 400,
        color: disabled
          ? 'var(--fg-muted)'
          : selected
            ? 'var(--fg-1)'
            : 'var(--fg-2)',
        background: !disabled && selected ? 'var(--surface)' : 'transparent',
        // 外の枠(角 8・枠 1・内側の余白 3)と同心にするため 8 − 1 − 3 = 4。
        borderRadius: 4,
        border: 0,
        boxShadow: !disabled && selected ? 'var(--shadow-1)' : 'none',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
