'use client'

import { useRouter, unstable_rethrow } from 'next/navigation'
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import type { SignInProvider } from '@/lib/auth/core'
import { ActionError } from '../_auth-ui/action-error'
import { clearLpNotice, markLpNotice } from '@/lib/lp-notice'
import { signOut } from './actions'
import {
  DRAWER_ARIA_LABEL,
  DRAWER_HEADER,
  IRREVERSIBLE_NOTICE,
  ITEM_ADD_HOME,
  ITEM_LOGOUT,
  LOGOUT_ERROR,
  ITEM_SAVED,
  ITEM_USERNAME,
  ITEM_WITHDRAW,
  LINK_PRIVACY,
  LINK_TERMS,
} from './drawer-copy'
import { UsernameDialog } from './username-dialog'
import { WithdrawDialog } from './withdraw-dialog'

/**
 * WP-11 右ドロワー E-0(開ききった状態)/ E-0b(右スワイプ途中)。design
 * 一次ソース = claude.ai/design `hareMa アカウントフロー.dc.html`(drawer-copy.ts と同じ etag)。
 * 地図画面のルート(map-screen.tsx の版面いっぱいの固定 div)の中に置かれる前提で `position: absolute` を使う
 * (計画 §単位1・PROMPT §2 の造形転記)。装着(map-screen.tsx 側の mount/props)はこの component の
 * 外。ダイアログの開閉状態はここが持ち、ドロワーが閉じていても(項目タップ直後)描き続ける
 * (design E-1〜E-4 の frame にドロワーは無い)。
 */

export type AccountSnapshot = {
  username: string
  /** ログインに使った事業者(退会の本人の確認の出し分け用・ID トークンの署名検証の後に読んだ値)。不明は null。 */
  provider: SignInProvider | null
}

type DialogKind = 'username' | 'withdraw' | null

/** login-replace の FREEZE(compare-v3 ②④): 失敗の 2 文が 1 行ずつ収まる幅。 */
const DRAWER_WIDTH = 320
const SWIPE_CLOSE_THRESHOLD = DRAWER_WIDTH / 2

type SwipeState = {
  dx: number
  phase: 'dragging' | 'closing' | 'snapping'
}

export function AccountDrawer({
  open,
  onClose,
  account,
  onAddToHome,
  onDialogChange,
}: {
  open: boolean
  onClose: () => void
  account: AccountSnapshot
  /** ホーム画面に追加する(`prompt()` を呼ぶ)。渡された時だけ項目を出す(Android の Chrome でまだ追加していない人)。 */
  onAddToHome?: () => void
  /** ユーザー名変更・退会のダイアログの開閉を親へ知らせる(開いている間はホーム画面の案内を出さない)。 */
  onDialogChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogKind>(null)
  useEffect(() => {
    onDialogChange?.(dialog !== null)
  }, [dialog, onDialogChange])
  const [pendingLogout, setPendingLogout] = useState(false)
  const [logoutFailed, setLogoutFailed] = useState(false)
  const [swipe, setSwipe] = useState<SwipeState | null>(null)
  const startXRef = useRef<number | null>(null)

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!open) return
    const touch = event.touches[0]
    if (!touch) return
    startXRef.current = touch.clientX
    setSwipe({ dx: 0, phase: 'dragging' })
  }

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return
    const touch = event.touches[0]
    if (!touch) return
    const dx = Math.max(0, touch.clientX - startXRef.current)
    setSwipe({ dx, phase: 'dragging' })
  }

  const handleTouchEnd = () => {
    if (startXRef.current === null || !swipe) return
    startXRef.current = null
    if (swipe.dx > SWIPE_CLOSE_THRESHOLD) {
      setSwipe({ dx: DRAWER_WIDTH, phase: 'closing' })
      window.setTimeout(() => {
        setSwipe(null)
        onClose()
      }, 180)
    } else if (swipe.dx === 0) {
      // タップ(touchmove なし)。項目 button のタップは touchstart で dragging に入るが、動いて
      // いないので snapping(180ms)へは入れず即時に解除する —— click で親が閉じた後に
      // swipe が残ってドロワーがダイアログの背後に 180ms 静止するのを避ける(裁定 RU1-02(a))。
      setSwipe(null)
    } else {
      setSwipe({ dx: 0, phase: 'snapping' })
      window.setTimeout(() => {
        setSwipe(null)
      }, 180)
    }
  }

  // 閉状態(open=false)は swipe の残留に関わらず閉じた描画を優先する(裁定 RU1-02(a))。
  // 閉じきった後(240ms)は visibility: hidden で不可視にし、開くときは即時 visible に戻す
  // (RU1-02(b)。fixed の根の外へ translateX(100%) で押し出した本体が「版面から溢れている」型の
  // 機械検査に掛からないようにする。transition は変更後の状態の値が効くので、閉状態にだけ遅延を持たせる)。
  const closed = !open
  const hidden = closed && !swipe
  const translateX = closed ? '100%' : swipe ? `${swipe.dx}px` : '0'
  const drawerTransition =
    !closed && swipe
      ? swipe.phase === 'dragging'
        ? 'none'
        : 'transform 180ms cubic-bezier(0.4,0,0.2,1)'
      : closed
        ? 'transform 240ms cubic-bezier(0.4,0,0.2,1), visibility 0s linear 240ms'
        : 'transform 240ms cubic-bezier(0.4,0,0.2,1), visibility 0s'
  const scrimOpacity = closed ? 0 : swipe ? Math.max(0, 1 - swipe.dx / DRAWER_WIDTH) : 1
  const scrimTransition =
    !closed && swipe
      ? swipe.phase === 'dragging'
        ? 'none'
        : 'opacity 180ms cubic-bezier(0.4,0,0.2,1)'
      : 'opacity 240ms cubic-bezier(0.4,0,0.2,1)'

  const closeAnd = (action: () => void) => {
    onClose()
    action()
  }

  const handleLogout = async () => {
    if (pendingLogout) return
    setPendingLogout(true)
    setLogoutFailed(false)
    // 成功はサーバが cookie を消して LP へ移す(actions.ts の redirect)。移った後では置けないので、印は呼ぶ前に置く。
    markLpNotice('logout')
    try {
      await signOut()
    } catch (error) {
      // 成功の移動は redirect の throw として届く。握りつぶさずに Next.js へ返す(framework-traps)。
      unstable_rethrow(error)
      // 到達不能などの本当の失敗はここを通って下へ。
    }
    // 失敗(cookie はサーバが保っている)。印を消し、ログアウトの下に失敗の 2 文を出す(FREEZE ④)。
    clearLpNotice()
    setLogoutFailed(true)
    setPendingLogout(false)
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="qs qs-scrim"
        onClick={() => {
          if (!pendingLogout) onClose()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 40,
          opacity: scrimOpacity,
          transition: scrimTransition,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <div
        inert={!open}
        aria-hidden={!open}
        className="qs qs-dw"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: DRAWER_WIDTH,
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          transform: `translateX(${translateX})`,
          visibility: hidden ? 'hidden' : 'visible',
          transition: drawerTransition,
          touchAction: 'none',
        }}
      >
        <div className="qs-dw-h">
          <span className="qs-lab">{DRAWER_HEADER}</span>
          {/* 閉じるボタン(FREEZE ② の「新」のヘッダ = MENU と矢印のボタン・スワイプとスクリムのタップでも閉じる)。 */}
          <button
            type="button"
            className="qs-ib"
            aria-label="メニューを閉じる"
            disabled={pendingLogout}
            onClick={onClose}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <nav
          aria-label={DRAWER_ARIA_LABEL}
          aria-busy={pendingLogout}
          style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
        >
          <button
            type="button"
            disabled={pendingLogout}
            onClick={() => closeAnd(() => router.push('/saved'))}
            className="qs-it"
          >
            {ITEM_SAVED}
            <span className="qs-ar">{'→'}</span>
          </button>
          <button
            type="button"
            disabled={pendingLogout}
            onClick={() => closeAnd(() => setDialog('username'))}
            className="qs-it"
          >
            {ITEM_USERNAME}
            <span className="qs-ar">{'→'}</span>
          </button>
          {onAddToHome && (
            <button
              type="button"
              disabled={pendingLogout}
              onClick={() => closeAnd(onAddToHome)}
              className="qs-it"
            >
              {ITEM_ADD_HOME}
              <span className="qs-ar">{'→'}</span>
            </button>
          )}

          <div style={{ flex: 1 }} />

          <p className="qs-nt">
            <span className="qs-bar" aria-hidden="true" />
            {IRREVERSIBLE_NOTICE}
          </p>
          <button
            type="button"
            disabled={pendingLogout}
            onClick={() => closeAnd(() => setDialog('withdraw'))}
            className="qs-it"
          >
            {ITEM_WITHDRAW}
            <span className="qs-ar">{'→'}</span>
          </button>
          <button
            type="button"
            disabled={pendingLogout}
            aria-busy={pendingLogout}
            onClick={handleLogout}
            className="qs-it"
          >
            {ITEM_LOGOUT}
            {pendingLogout ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <span className="qs-ar">{'→'}</span>
            )}
          </button>
          {logoutFailed && <ActionError lines={LOGOUT_ERROR} />}
          {/* 規約とポリシー(harema#111・案 B)。新しいタブで開き、地図の位置を残す。 */}
          <div className="qs-dw-lk">
            <a href="/terms" target="_blank" rel="noopener">
              {LINK_TERMS}
            </a>
            <a href="/privacy" target="_blank" rel="noopener">
              {LINK_PRIVACY}
            </a>
          </div>
        </nav>
      </div>

      {dialog === 'username' && (
        <UsernameDialog currentUsername={account.username} onClose={() => setDialog(null)} />
      )}
      {dialog === 'withdraw' && (
        <WithdrawDialog provider={account.provider} onCancel={() => setDialog(null)} />
      )}
    </>
  )
}
