// ホーム画面に追加する案内の、出す・出さないの判断と間隔(所有者の決定 2026-11-09・harema#46)。
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_INSTALL_RECORD,
  INSTALL_PROMPT_INTERVAL_MS,
  INSTALL_PROMPT_KEY,
  installModalDue,
  installModalTiming,
  installPromptAvailable,
  isAndroidDevice,
  readInstallRecord,
  recordAfterCancel,
  recordAfterInstalled,
  writeInstallRecord,
} from '../install-prompt.ts'

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)) }
}

describe('ホーム画面に追加する案内: 出す人', () => {
  it('HSP-A1 Android(UA)・iOS・PC', () => {
    assert.equal(isAndroidDevice(UA_ANDROID), true)
    assert.equal(isAndroidDevice(UA_IPHONE), false)
    assert.equal(isAndroidDevice(UA_PC), false)
  })
  it('HSP-A2 userAgentData があればそれを優先する', () => {
    assert.equal(isAndroidDevice(UA_PC, 'Android'), true)
    assert.equal(isAndroidDevice(UA_ANDROID, 'Windows'), false)
    assert.equal(isAndroidDevice(UA_ANDROID, ''), true)
    assert.equal(isAndroidDevice(UA_ANDROID, null), true)
  })
  it('HSP-A3 対象は Android かつ standalone でなく事件がある時だけ', () => {
    assert.equal(installPromptAvailable({ android: true, standalone: false, hasEvent: true }), true)
    assert.equal(installPromptAvailable({ android: true, standalone: true, hasEvent: true }), false)
    assert.equal(installPromptAvailable({ android: false, standalone: false, hasEvent: true }), false)
    assert.equal(installPromptAvailable({ android: true, standalone: false, hasEvent: false }), false)
  })
})

describe('ホーム画面に追加する案内: 出す間隔', () => {
  it('HSP-D1 記録が無ければ出す', () => {
    assert.equal(installModalDue(EMPTY_INSTALL_RECORD, NOW), true)
  })
  it('HSP-D2 チェックありで閉じた記録は二度と出さない(1 年後も)', () => {
    const r = recordAfterCancel(EMPTY_INSTALL_RECORD, true, NOW)
    assert.equal(r.hidden, true)
    assert.equal(installModalDue(r, NOW + 365 * DAY), false)
  })
  it('HSP-D3 チェックなしで閉じたら 1 日あける(24 時間の境目)', () => {
    const r = recordAfterCancel(EMPTY_INSTALL_RECORD, false, NOW)
    assert.deepEqual(r, { hidden: false, dismissedAt: NOW })
    assert.equal(INSTALL_PROMPT_INTERVAL_MS, DAY)
    assert.equal(installModalDue(r, NOW), false)
    assert.equal(installModalDue(r, NOW + DAY - 1), false)
    assert.equal(installModalDue(r, NOW + DAY), true)
    assert.equal(installModalDue(r, NOW + DAY + 1), true)
  })
  it('HSP-D4 時計が戻って未来の時刻が残った時は出す', () => {
    assert.equal(installModalDue({ hidden: false, dismissedAt: NOW + DAY }, NOW), true)
  })
  it('HSP-D5 追加が済んだら出さない', () => {
    const r = recordAfterInstalled({ hidden: false, dismissedAt: NOW })
    assert.equal(installModalDue(r, NOW + 30 * DAY), false)
  })
  it('HSP-D6 後からチェックなしで閉じても「もう出さない」は戻らない', () => {
    const r = recordAfterCancel({ hidden: true, dismissedAt: null }, false, NOW)
    assert.equal(r.hidden, true)
    assert.equal(installModalDue(r, NOW + 30 * DAY), false)
  })
})

describe('ホーム画面に追加する案内: 時期', () => {
  it('HSP-T1 位置情報の許可を求めている最中・検索・保存シート・メニューが開いている間は出さない', () => {
    const base = { locationPending: false, searchOpen: false, sheetOpen: false, drawerOpen: false }
    assert.equal(installModalTiming(base), true)
    assert.equal(installModalTiming({ ...base, locationPending: true }), false)
    assert.equal(installModalTiming({ ...base, searchOpen: true }), false)
    assert.equal(installModalTiming({ ...base, sheetOpen: true }), false)
    assert.equal(installModalTiming({ ...base, drawerOpen: true }), false)
    assert.equal(installModalTiming({ locationPending: true, searchOpen: true, sheetOpen: true, drawerOpen: true }), false)
  })
})

describe('ホーム画面に追加する案内: 端末の中の記録', () => {
  it('HSP-S1 書いて読むと同じ。鍵は harema:install-prompt', () => {
    const s = fakeStorage()
    writeInstallRecord({ hidden: false, dismissedAt: NOW }, () => s)
    assert.equal(s.m.has(INSTALL_PROMPT_KEY), true)
    assert.equal(INSTALL_PROMPT_KEY, 'harema:install-prompt')
    assert.deepEqual(readInstallRecord(() => s), { hidden: false, dismissedAt: NOW })
  })
  it('HSP-S2 無い・壊れた・形の違う値は記録なし。保存が使えなくても落ちない', () => {
    assert.deepEqual(readInstallRecord(() => fakeStorage()), EMPTY_INSTALL_RECORD)
    assert.deepEqual(readInstallRecord(() => fakeStorage({ [INSTALL_PROMPT_KEY]: '{' })), EMPTY_INSTALL_RECORD)
    assert.deepEqual(readInstallRecord(() => fakeStorage({ [INSTALL_PROMPT_KEY]: '7' })), EMPTY_INSTALL_RECORD)
    assert.deepEqual(
      readInstallRecord(() => fakeStorage({ [INSTALL_PROMPT_KEY]: '{"hidden":"yes","dismissedAt":"x"}' })),
      EMPTY_INSTALL_RECORD,
    )
    const broken = () => {
      throw new Error('blocked')
    }
    assert.deepEqual(readInstallRecord(broken), EMPTY_INSTALL_RECORD)
    assert.doesNotThrow(() => writeInstallRecord(EMPTY_INSTALL_RECORD, broken))
  })
})
