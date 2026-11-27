// 定期実行の成否の確かめ用の口(harema#168)。cron-health.ts と route.ts を読む。
// 実行: `pnpm --filter web test`(node の type stripping で cron-health.ts を直接読む)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createCronHealthReader, toCronHealthReport } from '../cron-health.ts'

const ALL_TRUE = { refresh_places: true, cleanup_ogp: true, purge_coords: true }

describe('toCronHealthReport', () => {
  it('3 つとも true なら 200 と 3 つの ok', () => {
    assert.deepEqual(toCronHealthReport(ALL_TRUE), {
      status: 200,
      body: { refreshPlaces: 'ok', cleanupOgp: 'ok', purgeCoords: 'ok' },
    })
  })
  it('1 つでも false なら 503(該当だけ ng)', () => {
    assert.deepEqual(toCronHealthReport({ ...ALL_TRUE, cleanup_ogp: false }), {
      status: 503,
      body: { refreshPlaces: 'ok', cleanupOgp: 'ng', purgeCoords: 'ok' },
    })
    assert.equal(toCronHealthReport({ ...ALL_TRUE, refresh_places: false }).status, 503)
    assert.equal(toCronHealthReport({ ...ALL_TRUE, purge_coords: false }).status, 503)
  })
  it('true 以外(false・無い・文字列の true・null・1)は ng', () => {
    for (const bad of [false, undefined, 'true', null, 1]) {
      const r = toCronHealthReport({ ...ALL_TRUE, refresh_places: bad })
      assert.equal(r.status, 503)
      assert.equal(r.body.refreshPlaces, 'ng')
    }
  })
  it('行が無い・配列・数は 3 つとも ng で 503', () => {
    for (const bad of [undefined, null, [], [ALL_TRUE], 5, 'x']) {
      assert.deepEqual(toCronHealthReport(bad), {
        status: 503,
        body: { refreshPlaces: 'ng', cleanupOgp: 'ng', purgeCoords: 'ng' },
      })
    }
  })
  it('本文のキーは refreshPlaces・cleanupOgp・purgeCoords だけ(行に余計な列があっても出さない)', () => {
    const r = toCronHealthReport({ ...ALL_TRUE, secret: 'x', jobid: 7 })
    assert.deepEqual(Object.keys(r.body).sort(), ['cleanupOgp', 'purgeCoords', 'refreshPlaces'])
  })
})

function makeReader(readImpl) {
  let t = 1_000_000
  let calls = 0
  const reader = createCronHealthReader({
    read: () => {
      calls += 1
      return readImpl()
    },
    now: () => t,
  })
  return { reader, calls: () => calls, advance: (ms) => { t += ms } }
}

describe('createCronHealthReader', () => {
  it('60 秒の内は read を 1 回しか呼ばない・60 秒を過ぎたら呼び直す', async () => {
    const h = makeReader(async () => ALL_TRUE)
    await h.reader()
    h.advance(59_999)
    await h.reader()
    assert.equal(h.calls(), 1)
    h.advance(1)
    await h.reader()
    assert.equal(h.calls(), 2)
  })
  it('同時の 5 回で read は 1 回', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    const h = makeReader(async () => { await gate; return ALL_TRUE })
    const all = Promise.all([1, 2, 3, 4, 5].map(() => h.reader()))
    release()
    const results = await all
    assert.equal(h.calls(), 1)
    assert.ok(results.every((r) => r.status === 200))
  })
  it('read が投げたら 503 と error: unavailable だけ(メッセージを含まない)', async () => {
    const h = makeReader(async () => { throw new Error('connection to db.internal failed: secret') })
    const r = await h.reader()
    assert.deepEqual(r, { status: 503, body: { error: 'unavailable' } })
    assert.ok(!JSON.stringify(r).includes('secret'))
  })
  it('read が投げた後の 60 秒は read を呼ばない', async () => {
    const h = makeReader(async () => { throw new Error('x') })
    await h.reader()
    h.advance(30_000)
    await h.reader()
    assert.equal(h.calls(), 1)
    h.advance(30_000)
    await h.reader()
    assert.equal(h.calls(), 2)
  })
  it('read が同期で投げても 503 unavailable', async () => {
    const h = makeReader(() => { throw new Error('sync') })
    assert.deepEqual(await h.reader(), { status: 503, body: { error: 'unavailable' } })
  })
})

describe('route.ts(文字で読む)', () => {
  const route = readFileSync(new URL('../../../app/api/health/cron/route.ts', import.meta.url), 'utf8')
  it('no-store・force-dynamic・server-only を持ち、console を呼ばない', () => {
    assert.match(route, /'Cache-Control': 'no-store'/)
    assert.match(route, /export const dynamic = 'force-dynamic'/)
    assert.match(route, /^import 'server-only'/m)
    assert.doesNotMatch(route, /\bconsole\b/)
  })
  it('GET は引数を取らず、request・req・headers(・cookies(・searchParams の語が無い', () => {
    assert.match(route, /export async function GET\(\)/)
    assert.doesNotMatch(route, /\b(request|req|searchParams)\b/i)
    assert.doesNotMatch(route, /\b(headers|cookies)\(/)
  })
})
