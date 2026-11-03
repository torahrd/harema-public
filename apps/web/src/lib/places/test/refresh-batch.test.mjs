// T-W2 / T-W3: 定期の取り直しの 1 回ぶん(偽の依存)と、口(route.ts)・vercel.json の読み取りの確かめ。
// 実行: `pnpm --filter web test`(node の type stripping で refresh-batch.ts を直接読む)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { runPlaceRefreshBatch } from '../refresh-batch.ts'

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`)
const resolved = (id) => ({ googlePlaceId: id, latitude: 35, longitude: 139 })
const tick = () => new Promise((r) => setTimeout(r, 1))

describe('runPlaceRefreshBatch', () => {
  it('claim が [] なら fetch は 0 回', async () => {
    let fetched = 0
    const r = await runPlaceRefreshBatch(
      { claim: async () => [], fetchLocation: async () => (fetched += 1, null), upsert: async () => {} },
      { concurrency: 5 },
    )
    assert.equal(fetched, 0)
    assert.deepEqual(r, { picked: 0, refreshed: 0, missing: 0, failed: 0 })
  })

  it('12 件・concurrency 5 → 同時に走る fetch の最大が 5・fetch はちょうど 12 回', async () => {
    let running = 0
    let max = 0
    let fetched = 0
    const r = await runPlaceRefreshBatch(
      {
        claim: async () => ids(12),
        fetchLocation: async (id) => {
          fetched += 1
          running += 1
          max = Math.max(max, running)
          await tick()
          running -= 1
          return resolved(id)
        },
        upsert: async () => {},
      },
      { concurrency: 5 },
    )
    assert.equal(max, 5)
    assert.equal(fetched, 12)
    assert.equal(r.picked, 12)
    assert.equal(r.refreshed, 12)
  })

  it('fetch が null の 3 件は upsert されず missing = 3', async () => {
    const upserted = []
    const r = await runPlaceRefreshBatch(
      {
        claim: async () => ids(8),
        fetchLocation: async (id) => (['p1', 'p3', 'p5'].includes(id) ? null : resolved(id)),
        upsert: async (p) => { upserted.push(p.googlePlaceId) },
      },
      { concurrency: 5 },
    )
    assert.equal(r.missing, 3)
    assert.equal(r.refreshed, 5)
    assert.equal(upserted.length, 5)
    for (const id of ['p1', 'p3', 'p5']) assert.equal(upserted.includes(id), false)
  })

  it('upsert が 1 件だけ投げても他の upsert は全部呼ばれ failed = 1', async () => {
    let upserts = 0
    const r = await runPlaceRefreshBatch(
      {
        claim: async () => ids(6),
        fetchLocation: async (id) => resolved(id),
        upsert: async (p) => {
          upserts += 1
          if (p.googlePlaceId === 'p2') throw new Error('boom')
        },
      },
      { concurrency: 5 },
    )
    assert.equal(upserts, 6)
    assert.equal(r.failed, 1)
    assert.equal(r.refreshed, 5)
  })

  it('claim が投げたら fetch は 0 回で例外が上がる', async () => {
    let fetched = 0
    await assert.rejects(
      runPlaceRefreshBatch(
        {
          claim: async () => { throw new Error('db') },
          fetchLocation: async () => (fetched += 1, null),
          upsert: async () => {},
        },
        { concurrency: 5 },
      ),
    )
    assert.equal(fetched, 0)
  })
})

describe('口の形(route.ts・vercel.json の読み取り)', () => {
  const route = readFileSync(new URL('../../../app/api/cron/refresh-places/route.ts', import.meta.url), 'utf8')
  const vercel = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8'))

  it('照合が claim より前にある', () => {
    const auth = route.indexOf('isAuthorizedCronRequest(')
    const claim = route.indexOf('claimPlaceRefreshBatch(')
    assert.ok(auth >= 0 && claim >= 0)
    assert.ok(auth < claim)
  })
  it('maxDuration = 60', () => {
    assert.match(route, /export const maxDuration = 60\b/)
  })
  it('no-store が 2 回以上', () => {
    assert.ok(route.split('no-store').length - 1 >= 2)
  })
  it('vercel.json の crons は 1 本・path と schedule', () => {
    assert.equal(vercel.crons.length, 1)
    assert.equal(vercel.crons[0].path, '/api/cron/refresh-places')
    assert.equal(vercel.crons[0].schedule, '0 6 * * *')
  })
})
