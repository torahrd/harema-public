// watchPosition の失敗で現在地の表示を落とすか(N-3)。
// 実行: `pnpm --filter web test`(node の type stripping で watch-error.ts を直接読む)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { watchErrorRevokesLocation } from '../watch-error.ts'

describe('watchErrorRevokesLocation', () => {
  it('PERMISSION_DENIED(1)は落とす', () => {
    assert.equal(watchErrorRevokesLocation(1), true)
  })
  it('POSITION_UNAVAILABLE(2)は落とさない', () => {
    assert.equal(watchErrorRevokesLocation(2), false)
  })
  it('TIMEOUT(3)は落とさない', () => {
    assert.equal(watchErrorRevokesLocation(3), false)
  })
})
