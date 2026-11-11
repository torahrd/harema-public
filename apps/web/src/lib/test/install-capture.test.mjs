// hydration より前の beforeinstallprompt を預ける捕まえの script(lib/install-capture.ts)。実行: `pnpm --filter web test`
// script の文字列を、偽の window・navigator の中で実際に走らせて振る舞いを確かめる。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, it } from 'node:test'
import { INSTALL_CAPTURE_KEY, INSTALL_CAPTURE_SCRIPT } from '../install-capture.ts'

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0.0.0 Mobile Safari/537.36'
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36'

function run({ ua, platform, standalone = false }) {
  const listeners = {}
  const window = {
    addEventListener: (n, f) => void (listeners[n] = f),
    matchMedia: (q) => ({ matches: standalone && q === '(display-mode: standalone)' }),
  }
  const navigator = { userAgent: ua, ...(platform === undefined ? {} : { userAgentData: { platform } }) }
  runInNewContext(INSTALL_CAPTURE_SCRIPT, { window, navigator })
  return { window, listeners, slot: window[INSTALL_CAPTURE_KEY] }
}
const fakeEvent = () => ({ prevented: false, preventDefault() { this.prevented = true } })

describe('事件の捕まえ', () => {
  it('HSC-1 Android(standalone でない)は事件を preventDefault して預ける', () => {
    const { listeners, slot } = run({ ua: UA_ANDROID })
    const e = fakeEvent()
    listeners.beforeinstallprompt(e)
    assert.equal(e.prevented, true)
    assert.equal(slot.event, e)
  })
  it('HSC-2 PC・standalone・userAgentData が Android でない時は受けない(preventDefault もしない)', () => {
    for (const o of [{ ua: UA_PC }, { ua: UA_ANDROID, standalone: true }, { ua: UA_ANDROID, platform: 'Windows' }]) {
      const { listeners, slot } = run(o)
      assert.equal(listeners.beforeinstallprompt, undefined)
      assert.equal(slot.event, null)
    }
  })
  it('HSC-3 userAgentData が Android なら UA が PC でも受ける', () => {
    const { listeners } = run({ ua: UA_PC, platform: 'Android' })
    assert.equal(typeof listeners.beforeinstallprompt, 'function')
  })
  it('HSC-4 appinstalled で印を立て、預けた事件を手放す', () => {
    const { listeners, slot } = run({ ua: UA_ANDROID })
    listeners.beforeinstallprompt(fakeEvent())
    listeners.appinstalled()
    assert.equal(slot.installed, true)
    assert.equal(slot.event, null)
  })
  it('HSC-5 壊れた環境(matchMedia・navigator が無い)でも throw しない', () => {
    assert.doesNotThrow(() => runInNewContext(INSTALL_CAPTURE_SCRIPT, { window: {}, navigator: {} }))
  })
  it('HSC-6 外部の読み込み・通信を持たない', () => {
    assert.doesNotMatch(INSTALL_CAPTURE_SCRIPT, /https?:|fetch|XMLHttpRequest|import\(|document\./)
  })
})

describe('捕まえの配線', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('HSC-7 root の layout が body の先頭に素の inline script として置く(next/script を使わない)', () => {
    const layout = read('../../app/layout.tsx')
    assert.doesNotMatch(layout, /next\/script/)
    assert.match(layout, /<body[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<script dangerouslySetInnerHTML=\{\{ __html: INSTALL_CAPTURE_SCRIPT \}\} \/>/)
    assert.doesNotMatch(layout, /<script[^>]*\ssrc=/)
  })
  it('HSC-8 hook は mount の時に預けられた事件と appinstalled を先に読み、使ったら手放す', () => {
    const hook = read('../../app/map/use-install-prompt.ts')
    assert.match(hook, /Reflect\.get\(window, INSTALL_CAPTURE_KEY\)/)
    assert.match(hook, /takeCaptured\(\)/)
    assert.match(hook, /slot\.event instanceof Event\) onBeforeInstall\(slot\.event\)/)
    assert.match(hook, /slot\.installed === true/)
    assert.match(hook, /clearCapturedEvent\(\)\n\s*setOffer\(null\)\n\s*setModalClosed\(true\)/)
  })
})
