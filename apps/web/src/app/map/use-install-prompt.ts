'use client'

import { useCallback, useEffect, useState } from 'react'
import { INSTALL_CAPTURE_KEY } from '@/lib/install-capture'
import {
  installModalDue,
  isAndroidDevice,
  installPromptAvailable,
  readInstallRecord,
  recordAfterCancel,
  recordAfterInstalled,
  writeInstallRecord,
} from '@/lib/install-prompt'

/** Chrome の `beforeinstallprompt` の事件(標準の型に無いので、使う所だけ書く)。 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return typeof Reflect.get(event, 'prompt') === 'function' && Reflect.has(event, 'userChoice')
}

/** root の layout の捕まえ(lib/install-capture.ts)が預けた物。無ければ null。 */
function capturedSlot(): { event: unknown; installed: unknown } | null {
  const slot: unknown = Reflect.get(window, INSTALL_CAPTURE_KEY)
  if (typeof slot !== 'object' || slot === null) return null
  return { event: Reflect.get(slot, 'event'), installed: Reflect.get(slot, 'installed') }
}

function clearCapturedEvent(): void {
  const slot: unknown = Reflect.get(window, INSTALL_CAPTURE_KEY)
  if (typeof slot === 'object' && slot !== null) Reflect.set(slot, 'event', null)
}

function uaDataPlatform(): string | null {
  const data: unknown = Reflect.get(navigator, 'userAgentData')
  if (typeof data !== 'object' || data === null) return null
  const platform: unknown = Reflect.get(data, 'platform')
  return typeof platform === 'string' ? platform : null
}

/**
 * ホーム画面に追加する案内(Android の Chrome だけ)。`beforeinstallprompt` を受けた時だけ案内の対象になり、
 * 事件を持っておく(`preventDefault()` で Chrome 自身の帯は出さない)。出す・出さないの判断は lib/install-prompt.ts。
 * - `canAdd`: メニューの項目を出すか(対象の人だけ)
 * - `modalDue`: 今回の読み込みでモーダルを出す間隔の条件を満たし、まだ閉じていないか(時期の条件は呼ぶ側が足す)
 * - `add`: `prompt()` を呼ぶ(クリックの処理の中で呼ぶ)。Chrome の確認を利用者が閉じた時はキャンセルと同じ記録
 * - `cancel`: モーダルのキャンセル(チェックありなら二度と出さない・なしなら時刻を置いて 1 日あける)
 * 追加が済んだ(`appinstalled`)ら出さない。記録は端末の中(localStorage)だけ。
 */
export function useInstallPrompt() {
  const [offer, setOffer] = useState<{ event: InstallPromptEvent; due: boolean } | null>(null)
  const [modalClosed, setModalClosed] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      if (!isInstallPromptEvent(event)) return
      const available = installPromptAvailable({
        android: isAndroidDevice(navigator.userAgent, uaDataPlatform()),
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        hasEvent: true,
      })
      if (!available) return
      event.preventDefault()
      setOffer({ event, due: installModalDue(readInstallRecord(), Date.now()) })
    }
    const onInstalled = () => {
      writeInstallRecord(recordAfterInstalled(readInstallRecord()))
      clearCapturedEvent()
      setOffer(null)
    }
    // mount より前に来た物(捕まえが預けた事件・appinstalled)を先に読む。その後の物は下の listener が受ける。
    const takeCaptured = () => {
      const slot = capturedSlot()
      if (!slot) return
      if (slot.installed === true) {
        onInstalled()
        return
      }
      if (slot.event instanceof Event) onBeforeInstall(slot.event)
    }
    takeCaptured()
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const cancel = useCallback((neverShowAgain: boolean) => {
    writeInstallRecord(recordAfterCancel(readInstallRecord(), neverShowAgain, Date.now()))
    setModalClosed(true)
  }, [])

  const add = useCallback(
    (neverShowAgain: boolean) => {
      if (!offer) return
      const { event } = offer
      // 事件は 1 回しか使えない。使ったら手放す(Chrome が新しく渡せば、また対象になる)。
      clearCapturedEvent()
      setOffer(null)
      setModalClosed(true)
      event.prompt().catch(() => {})
      event.userChoice
        .then((choice) => {
          if (choice.outcome === 'dismissed') {
            writeInstallRecord(recordAfterCancel(readInstallRecord(), neverShowAgain, Date.now()))
          }
        })
        .catch(() => {})
    },
    [offer],
  )

  return { canAdd: offer !== null, modalDue: offer !== null && offer.due && !modalClosed, add, cancel }
}
