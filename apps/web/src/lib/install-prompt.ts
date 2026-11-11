// ホーム画面に追加する案内(web・Android の Chrome だけ)の、出す・出さないの判断と記録。
// 純粋な関数だけ(node のテストが読む)。相対 import だけで書く(別名の import も持たない)。
// 記録は端末の中(localStorage)に「もう出さない」の印と、チェックなしで閉じた時刻の 2 つ。サーバ・DB は使わない。

export const INSTALL_PROMPT_KEY = 'harema:install-prompt'

/** チェックなしで閉じた後に、次のモーダルを出すまでの間隔(所有者の決定 2026-11-09)。 */
export const INSTALL_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000

export type InstallPromptRecord = {
  /** 「もう表示しない」を付けて閉じた。二度と出さない。 */
  hidden: boolean
  /** チェックなしで閉じた時刻(ms)。 */
  dismissedAt: number | null
}

export const EMPTY_INSTALL_RECORD: InstallPromptRecord = { hidden: false, dismissedAt: null }

type GetStorage = () => Pick<Storage, 'getItem' | 'setItem'>

const defaultStorage: GetStorage = () => window.localStorage

/** Android の端末か。userAgentData があればそれを、なければ UA の文字列を見る。 */
export function isAndroidDevice(ua: string, uaDataPlatform?: string | null): boolean {
  if (typeof uaDataPlatform === 'string' && uaDataPlatform !== '') return uaDataPlatform === 'Android'
  return /Android/i.test(ua)
}

/** 案内の対象か(メニューの項目の条件と同じ): Android で、ホーム画面から開いたのでなく、Chrome が追加の事件を渡している。 */
export function installPromptAvailable(input: {
  android: boolean
  standalone: boolean
  hasEvent: boolean
}): boolean {
  return input.android && !input.standalone && input.hasEvent
}

/** モーダルを今回の読み込みで出す間隔の条件(印と時刻だけ。時期の条件は別)。 */
export function installModalDue(record: InstallPromptRecord, now: number): boolean {
  if (record.hidden) return false
  if (record.dismissedAt === null) return true
  const elapsed = now - record.dismissedAt
  // 時計が戻って未来の時刻が残った時は、二度と出ない状態を避けて出す。
  return elapsed < 0 || elapsed >= INSTALL_PROMPT_INTERVAL_MS
}

/** モーダルを出す時期: 位置情報の許可を求めている最中・共有の続きの検索が開いている間・保存シートが開いている間・メニューが開いている間は出さない。 */
export function installModalTiming(input: {
  locationPending: boolean
  searchOpen: boolean
  sheetOpen: boolean
  drawerOpen: boolean
}): boolean {
  return !input.locationPending && !input.searchOpen && !input.sheetOpen && !input.drawerOpen
}

/** キャンセル(Chrome の確認を利用者が閉じた時も同じ)の後の記録。チェックありなら二度と出さない。 */
export function recordAfterCancel(
  record: InstallPromptRecord,
  neverShowAgain: boolean,
  now: number,
): InstallPromptRecord {
  return neverShowAgain ? { hidden: true, dismissedAt: record.dismissedAt } : { hidden: record.hidden, dismissedAt: now }
}

/** 追加が済んだ後(appinstalled)の記録。もう出さない。 */
export function recordAfterInstalled(record: InstallPromptRecord): InstallPromptRecord {
  return { hidden: true, dismissedAt: record.dismissedAt }
}

export function readInstallRecord(getStorage: GetStorage = defaultStorage): InstallPromptRecord {
  try {
    const raw = getStorage().getItem(INSTALL_PROMPT_KEY)
    if (raw === null) return EMPTY_INSTALL_RECORD
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return EMPTY_INSTALL_RECORD
    const hidden: unknown = Reflect.get(value, 'hidden')
    const dismissedAt: unknown = Reflect.get(value, 'dismissedAt')
    return {
      hidden: hidden === true,
      dismissedAt: typeof dismissedAt === 'number' && Number.isFinite(dismissedAt) ? dismissedAt : null,
    }
  } catch {
    // 保存が使えない・壊れた値。記録が無いのと同じに扱う。
    return EMPTY_INSTALL_RECORD
  }
}

export function writeInstallRecord(record: InstallPromptRecord, getStorage: GetStorage = defaultStorage): void {
  try {
    getStorage().setItem(INSTALL_PROMPT_KEY, JSON.stringify(record))
  } catch {
    // 保存が使えない環境。次の読み込みでまた出るだけで、地図は普通に使える。
  }
}
