// LP 見出しの真上の時刻の行(書式は HH:mm:ss のゼロ埋め・初回描画は Tokyo のみ)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { clockLabel, formatClock } from '../../app/_public/lp-clock-core.ts'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('LP の時刻の行', () => {
  it('formatClock は 24 時間表記でゼロ埋めする', () => {
    assert.equal(formatClock(new Date(2026, 0, 1, 9, 5, 7)), '09:05:07')
    assert.equal(formatClock(new Date(2026, 0, 1, 0, 0, 0)), '00:00:00')
    assert.equal(formatClock(new Date(2026, 0, 1, 23, 59, 59)), '23:59:59')
  })
  it('時刻が無い初回描画は Tokyo だけ、載せたら「Tokyo · 時刻」', () => {
    assert.equal(clockLabel(null), 'Tokyo')
    assert.equal(clockLabel('09:41:07'), 'Tokyo · 09:41:07')
  })
  it('LP は段 1 の .s1-text の最初(h1 の前)に LpClock を置く', () => {
    const page = read('../../app/page.tsx')
    assert.match(page, /<div className="s1-text">\s*<LpClock \/>\s*<h1/)
  })
  it('部品は p・aria-live なし・login 側に依存しない', () => {
    const src = read('../../app/_public/lp-clock.tsx')
    assert.match(src, /<p className="lp-clk"/)
    assert.doesNotMatch(src, /aria-live=/)
    assert.doesNotMatch(src, /login-eyebrow/)
  })
})
