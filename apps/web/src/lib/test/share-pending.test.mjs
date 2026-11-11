// 共有の受け口 → 地図へ渡す中身(sessionStorage・1 回だけ・10 分)。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SHARE_PENDING_KEY, handoffFromParsed, putPendingShare, takePendingShare } from '../share-pending.ts'

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  }
}
const NOW = 1_000_000_000_000
const TEN_MIN = 10 * 60 * 1000
const put = (s, createdAt = NOW) =>
  putPendingShare(handoffFromParsed({ searchQuery: 'すし匠', sourceText: 'https://tabelog.com/x' }, createdAt), () => s)

describe('共有の続き', () => {
  it('WST-P1 置いて読むと 1 回だけ', () => {
    const s = fakeStorage()
    put(s)
    assert.deepEqual(takePendingShare(() => s, NOW + 1000), { query: 'すし匠', sourceText: 'https://tabelog.com/x' })
    assert.equal(takePendingShare(() => s, NOW + 1000), null)
    assert.equal(s.m.has(SHARE_PENDING_KEY), false)
  })

  it('WST-P2 空の共有は置かない', () => {
    assert.equal(handoffFromParsed({ searchQuery: '', sourceText: null }, NOW), null)
  })

  it('WST-P3 10 分を過ぎた物は捨てる', () => {
    const s = fakeStorage()
    put(s)
    assert.equal(takePendingShare(() => s, NOW + TEN_MIN + 1), null)
    assert.equal(s.m.has(SHARE_PENDING_KEY), false)
    put(s)
    assert.notEqual(takePendingShare(() => s, NOW + TEN_MIN), null)
  })

  it('WST-P4 先の時刻は捨てる', () => {
    const s = fakeStorage()
    put(s, NOW + 60_000 + 1)
    assert.equal(takePendingShare(() => s, NOW), null)
    put(s, NOW + 60_000)
    assert.notEqual(takePendingShare(() => s, NOW), null)
  })

  it('WST-P5 壊れた中身', () => {
    for (const raw of [
      'not json',
      JSON.stringify({ v: 2, query: 'a', sourceText: null, createdAt: NOW }),
      JSON.stringify({ v: 1, query: 'a', sourceText: 'javascript:alert(1)', createdAt: NOW }),
    ]) {
      const s = fakeStorage({ [SHARE_PENDING_KEY]: raw })
      assert.equal(takePendingShare(() => s, NOW), null, raw)
      assert.equal(s.m.has(SHARE_PENDING_KEY), false, raw)
    }
  })

  it('WST-P6 保存が使えない環境', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    assert.doesNotThrow(() => put(broken))
    assert.equal(takePendingShare(() => broken, NOW), null)
    assert.equal(takePendingShare(() => { throw new Error('denied') }, NOW), null)
  })

  it('スキーマに通らない共有(検索が長すぎる)は置かない', () => {
    assert.equal(handoffFromParsed({ searchQuery: 'あ'.repeat(61), sourceText: null }, NOW), null)
  })
})
