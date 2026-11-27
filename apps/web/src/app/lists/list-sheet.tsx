'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { sheetCoverInset } from '../map/sheet-cover'
import { useSheetViewport } from '../map/use-sheet-viewport'
import { BODY, heading } from '../text-styles'
import type { ListItem } from './types'

/**
 * リストのシートの器(`SheetFrame`)と、リストの行を並べるシート(`ListSheet`・2 つの使い方)。
 * 器の値は保存のシート(`map/save-sheet.tsx`)と同じ(スクリム `--sheet-scrim`・上の角 `--radius-card`・上の枠 1px・
 * 影 `--sheet-shadow`・つまみ 40×4・上限 85svh)。`save-sheet.tsx` からは抜き出さず、同じ値でここに書く
 * (キーボードの追従・退場・地図の縮めを 1 つの部品で持つ S1 の動きを壊さないため)。
 * 重なりは `zBase`(スクリム = zBase・シート = zBase + 1)。保存のシートの上に重ねる時は 30 以上を渡す。
 * 仮の決定(所有者の再確認待ち・harema#152)。
 */

/** 退場の尺。globals.css の `--dur-slow: 240ms` と一致させる。 */
const EXIT_MS = 240

export type SheetFrameApi = { close: () => void }

type SheetFrameProps = {
  zBase: number
  title: string
  /**
   * 題の行を描かない(題の文は読み上げの名前だけに使う)。選ぶ段(リストを選ぶ・状態を選ぶ)は題を出さない
   * (所有者の決定 2026-11-26 22:40 JST・harema#152 のコメント 7193679845「この見出し自体がいらない」)。
   */
  hideTitle?: boolean
  /** 退場の後に呼ぶ。 */
  onClosed: () => void
  /** 名前の欄のように入力があるシートは true(キーボードの沈降の基準を凍結する)。 */
  holdBaseline?: boolean
  /** 外側を押しても閉じない(送信中など)。 */
  lockClose?: boolean
  children: (api: SheetFrameApi) => ReactNode
  footer?: (api: SheetFrameApi) => ReactNode
  /** シートの外(兄弟)に重ねる物(削除の確認のダイアログ)。シートの `transform` に閉じ込められない。 */
  overlay?: (api: SheetFrameApi) => ReactNode
}

export function SheetFrame({
  zBase,
  title,
  hideTitle = false,
  onClosed,
  holdBaseline = false,
  lockClose = false,
  children,
  footer,
  overlay,
}: SheetFrameProps) {
  const titleId = useId()
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { maxHeight, keyboardInset } = useSheetViewport(holdBaseline || leaving)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(onClosed, EXIT_MS)
    return () => window.clearTimeout(id)
  }, [leaving, onClosed])

  const close = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    setLeaving(true)
  }, [])
  const api: SheetFrameApi = { close }
  const visible = entered && !leaving

  return (
    <>
      <div
        onClick={() => {
          if (!lockClose) close()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: zBase,
          background: 'var(--sheet-scrim)',
          opacity: visible ? 1 : 0,
          transition: 'opacity var(--dur-slow) var(--ease)',
        }}
      />
      <div
        role="dialog"
        data-testid="list-sheet"
        aria-modal="true"
        aria-labelledby={hideTitle ? undefined : titleId}
        aria-label={hideTitle ? title : undefined}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: keyboardInset,
          zIndex: zBase + 1,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          maxHeight,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
          padding: '10px 0 0',
          boxShadow: visible ? 'var(--sheet-shadow)' : 'none',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition:
            'transform var(--dur-slow) var(--ease), box-shadow var(--dur-slow) var(--ease), bottom var(--dur-fast) var(--ease)',
        }}
      >
        <div style={{ flex: '0 1 auto', minHeight: 0, overflow: 'hidden', padding: '0 20px' }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'var(--border-strong)',
              margin: '0 auto 16px',
            }}
          />
          {!hideTitle && (
            <h2
              id={titleId}
              style={{ ...heading(20), color: 'var(--fg-1)', margin: '0 0 8px' }}
            >
              {title}
            </h2>
          )}
        </div>
        <div
          style={{
            // 縮む率 1000 = 題の帯より先に縮める(保存のシートと同じ。率が同じだと、上限に
            // 当たるたびに題の下側が削られて欠けた)。
            flex: '1 1000 auto',
            minHeight: 96,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '0 20px',
          }}
        >
          {children(api)}
        </div>
        {footer && (
          <div style={{ flex: 'none', padding: '14px 20px 24px' }}>{footer(api)}</div>
        )}
        {!footer && <div aria-hidden style={{ flex: 'none', height: 16 }} />}
      </div>
      {overlay?.(api)}
    </>
  )
}

/** 行の左のアイコンの枠(アイコンなしでも名前の左端をそろえる)。 */
export function IconSlot({ icon }: { icon: string | null }) {
  return (
    <span
      aria-hidden
      style={{ flex: 'none', width: 28, fontSize: 20, lineHeight: '24px', textAlign: 'center' }}
    >
      {icon}
    </span>
  )
}

export const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  minHeight: 56,
  boxSizing: 'border-box',
  padding: 0,
  background: 'transparent',
  border: 0,
  borderTop: '1px solid var(--border-subtle)',
  color: 'var(--fg-1)',
  textAlign: 'left',
  cursor: 'pointer',
  ...BODY,
}

const ARROW = '→'

type ListSheetProps = {
  zBase: number
  lists: readonly ListItem[]
  /**
   * 使い方。check = チェックで複数(保存のシートから・決定する で戻る)/ apply = 押すと反映(一括から)。
   */
  mode: 'check' | 'apply'
  title: string
  /** check: 今チェックが付いているリストの id。 */
  checkedIds?: readonly string[]
  onToggle?: (listId: string) => void
  /** check: 決定する。保存のシートへ戻る(シートを閉じる)。 */
  onConfirm?: () => void
  /** apply: リストを押した。 */
  onApply?: (list: ListItem) => void
  /** 末尾の「＋ 新しいリスト」。 */
  onNew: () => void
  /** 退場の後に呼ぶ(外側を押した・apply の後)。 */
  onClosed: () => void
  /** 反映中。行を押せなくする。 */
  busy?: boolean
}

export function ListSheet({
  zBase,
  lists,
  mode,
  title,
  checkedIds = [],
  onToggle,
  onConfirm,
  onApply,
  onNew,
  onClosed,
  busy = false,
}: ListSheetProps) {
  const t = useTranslations('web.lists')
  // apply は押した瞬間に閉じ始める。退場の間(240ms)の 2 回目の押下で二重に送らない。
  const appliedRef = useRef(false)
  return (
    <SheetFrame
      zBase={zBase}
      title={title}
      hideTitle
      onClosed={onClosed}
      lockClose={busy}
      footer={
        mode === 'check'
          ? (api) => (
              <button
                type="button"
                className="btn-hairline"
                onClick={() => {
                  onConfirm?.()
                  api.close()
                }}
              >
                {t('pickConfirm')} <span className="arrow">{ARROW}</span>
              </button>
            )
          : undefined
      }
    >
      {(api) => (
        <div style={{ opacity: busy ? 0.5 : 1 }}>
          {lists.map((list) =>
            mode === 'check' ? (
              <label key={list.id} style={{ ...ROW_STYLE, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <IconSlot icon={list.icon} />
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{list.name}</span>
                </span>
                <input
                  type="checkbox"
                  checked={checkedIds.includes(list.id)}
                  onChange={() => onToggle?.(list.id)}
                  style={{ flex: 'none', width: 20, height: 20, accentColor: 'var(--fg-1)' }}
                />
              </label>
            ) : (
              <button
                key={list.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (appliedRef.current) return
                  appliedRef.current = true
                  onApply?.(list)
                  api.close()
                }}
                style={{ ...ROW_STYLE, justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <IconSlot icon={list.icon} />
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{list.name}</span>
                </span>
              </button>
            ),
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onNew}
            style={{ ...ROW_STYLE, justifyContent: 'space-between', borderBottom: 0 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span aria-hidden style={{ flex: 'none', width: 28, textAlign: 'center' }}>
                +
              </span>
              <span>{t('newList')}</span>
            </span>
            <span aria-hidden>{ARROW}</span>
          </button>
        </div>
      )}
    </SheetFrame>
  )
}

/**
 * 一覧の画面でリストのシートが開いている間、地図の器の下端をシートの上端で終える(Google の帰属表示を隠さない。
 * 地図の画面の `use-sheet-cover.ts` と同じ理由)。寸法は `sheetCoverInset`(`map/sheet-cover.ts`)で計算する。
 * 一覧の地図の器は `flex: 1` の箱なので、その中の絶対配置の箱(`mapBoxRef`)の `bottom` を DOM に直接書く。
 * シートが無い間・シートの上端が器の上端より上の間は 0(元の寸法)。開いている間だけ毎フレーム測り、閉じたら 0 に戻す。
 * Places は呼ばない。地図の範囲の合わせ直しはしない。
 */
export function useListSheetCover(
  active: boolean,
  mapBoxRef: RefObject<HTMLElement | null>,
  outerRef: RefObject<HTMLElement | null>,
  sheetWrapperRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return
    const mapBox = mapBoxRef.current
    const outer = outerRef.current
    const wrapper = sheetWrapperRef.current
    if (!mapBox || !outer || !wrapper) return
    let frame = 0
    let previousTop = Number.NaN
    const tick = () => {
      const dialogs = wrapper.querySelectorAll<HTMLElement>('[role="dialog"]')
      const outerRect = outer.getBoundingClientRect()
      let sheetTop = Number.POSITIVE_INFINITY
      for (const dialog of dialogs) {
        sheetTop = Math.min(sheetTop, dialog.getBoundingClientRect().top - outerRect.top)
      }
      let inset = 0
      const movingDown = Number.isFinite(previousTop) && sheetTop > previousTop
      if (Number.isFinite(sheetTop) && sheetTop > 0 && sheetTop < outerRect.height && !movingDown) {
        inset = sheetCoverInset(sheetTop, outerRect.height)
      }
      previousTop = sheetTop
      const next = `${inset}px`
      if (mapBox.style.bottom !== next) mapBox.style.bottom = next
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
      mapBox.style.bottom = '0px'
    }
  }, [active, mapBoxRef, outerRef, sheetWrapperRef])
}
