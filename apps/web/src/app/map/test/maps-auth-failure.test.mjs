// 鍵の拒否(gm_authFailure)の store と、画面が拒否を見ていることの確かめ。
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createMapsAuthFailureStore } from '../maps-auth-failure.ts'

describe('createMapsAuthFailureStore', () => {
  it('呼ばれる前は失敗でない', () => {
    const store = createMapsAuthFailureStore()
    assert.equal(store.getSnapshot(), false)
  })

  it('購読すると gm_authFailure が置かれ、呼ばれると失敗になり購読者へ知らせる', () => {
    const store = createMapsAuthFailureStore()
    const target = {}
    let calls = 0
    store.subscribe(target, () => calls++)
    assert.equal(typeof target.gm_authFailure, 'function')
    target.gm_authFailure()
    assert.equal(store.getSnapshot(), true)
    assert.equal(calls, 1)
  })

  it('購読者が複数でも全員へ知らせる', () => {
    const store = createMapsAuthFailureStore()
    const target = {}
    let a = 0
    let b = 0
    store.subscribe(target, () => a++)
    store.subscribe(target, () => b++)
    target.gm_authFailure()
    assert.equal(a, 1)
    assert.equal(b, 1)
  })

  it('購読を外した後も gm_authFailure は残り、失敗を覚える(外した購読者へは知らせない)', () => {
    const store = createMapsAuthFailureStore()
    const target = {}
    let calls = 0
    const off = store.subscribe(target, () => calls++)
    off()
    assert.equal(typeof target.gm_authFailure, 'function')
    target.gm_authFailure()
    assert.equal(store.getSnapshot(), true)
    assert.equal(calls, 0)
  })

  it('一度失敗したら、後から購読しても失敗のまま(同じ文書では Google は 2 回目を呼ばない)', () => {
    const store = createMapsAuthFailureStore()
    const target = {}
    const off = store.subscribe(target, () => {})
    target.gm_authFailure()
    off()
    let calls = 0
    store.subscribe(target, () => calls++)
    assert.equal(store.getSnapshot(), true)
    assert.equal(calls, 0)
  })
})

describe('鍵の拒否を画面が見る', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

  it('地図画面は鍵の拒否を mapsFailed に入れる', () => {
    const src = read('map/map-screen.tsx')
    assert.match(src, /const mapsAuthFailed = useMapsAuthFailure\(\)/)
    assert.match(src, /const mapsFailed = apiStatus === APILoadingStatus\.FAILED \|\| mapsAuthFailed/)
  })

  it('一覧の地図は早い return の前で鍵の拒否を見る', () => {
    const src = read('saved/saved-list-map.tsx')
    const hook = src.indexOf('const mapsAuthFailed = useMapsAuthFailure()')
    const cond = src.indexOf('if (apiStatus === APILoadingStatus.FAILED || mapsAuthFailed)')
    assert.ok(hook >= 0 && cond >= 0 && hook < cond)
  })
})
