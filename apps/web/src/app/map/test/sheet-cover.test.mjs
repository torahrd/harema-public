// 保存シートが地図を覆う高さ(sheetCoverInset)と、シートの dialog 捕捉の契約。
// 実行: `pnpm --filter web test`(node の type stripping で sheet-cover.ts を直接読む)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MAP_EDGE_INSET, sheetCoverInset, sheetFollowInset } from '../sheet-cover.ts'

describe('sheetCoverInset', () => {
  it('(a) シートの上端 500・高さ 800 -> 300', () => {
    assert.equal(sheetCoverInset(500, 800), 300)
  })
  it('(b) 端数は丸めない', () => {
    assert.ok(Math.abs(sheetCoverInset(500.4, 800) - 299.6) < 1e-9)
  })
  it('(c1) 上端がちょうど画面の下端 -> 下端の帯の 12', () => {
    assert.equal(MAP_EDGE_INSET, 12)
    assert.equal(sheetCoverInset(800, 800), 12)
  })
  it('(c2) 上端が画面の外 -> 12', () => {
    assert.equal(sheetCoverInset(900, 800), 12)
  })
  it('(c3) シートが帯より低い -> 12 を下回らない', () => {
    assert.equal(sheetCoverInset(795, 800), 12)
  })
  it('(d) 負の上端 -> 画面全体を覆う', () => {
    assert.equal(sheetCoverInset(-10, 800), 800)
  })
  it('(e) NaN・Infinity -> 12', () => {
    assert.equal(sheetCoverInset(Number.NaN, 800), 12)
    assert.equal(sheetCoverInset(Number.POSITIVE_INFINITY, 800), 12)
    assert.equal(sheetCoverInset(Number.NEGATIVE_INFINITY, 800), 12)
  })
})

describe('契約: save-sheet.tsx の dialog', () => {
  it('(f) role="dialog" がちょうど 1 回だけ出る', () => {
    const src = readFileSync(new URL('../save-sheet.tsx', import.meta.url), 'utf8')
    assert.equal(src.split('role="dialog"').length - 1, 1)
  })
})

describe('sheetFollowInset', () => {
  it('(g) 動きの間にシートが下へ動く(閉じる) -> 12(全画面・帯を出さない)', () => {
    assert.equal(sheetFollowInset(520, 800, 500, true), 12)
  })
  it('(h) 動きの間にシートが上へ動く(開く) -> 追う', () => {
    assert.equal(sheetFollowInset(480, 800, 500, true), 320)
  })
  it('(i) 動きが終わったフレーム -> 下へ動いた後でも正しい値に戻す', () => {
    assert.equal(sheetFollowInset(520, 800, 500, false), 280)
  })
  it('(j) 前の値が無い(最初の測定) -> 追う', () => {
    assert.equal(sheetFollowInset(500, 800, Number.NaN, true), 300)
  })
})

describe('契約: use-sheet-cover.ts の後始末', () => {
  it('(k) 閉じたら器の下端を 0 でなく MAP_EDGE_INSET に戻す(帯の下に帰属を隠さない)', () => {
    const src = readFileSync(new URL('../use-sheet-cover.ts', import.meta.url), 'utf8')
    assert.ok(!src.includes("style.bottom = '0px'"))
    assert.ok(src.includes('style.bottom = `${MAP_EDGE_INSET}px`'))
  })
})
