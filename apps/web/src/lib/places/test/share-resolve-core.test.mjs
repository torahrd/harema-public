// W-SR1〜W-SR8: 共有の短い URL をたどる核(runShareResolve・readRedirectLocation)。fake の deps・fake の request だけ。ネットワークは使わない。
// 実行: `pnpm --filter web test`(CI に無い。Issue #100)
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { readRedirectLocation, runShareResolve } from '../share-resolve-core.ts'

const LONG_URL = 'https://maps.google.com?q=晴れ間食堂,+東京都渋谷区1-2-3&ftid=0x1:0x2&entry=gps&g_st=ic'

function makeDeps({ location = LONG_URL, claim = { allowed: true, key: 'k1' } } = {}) {
  const calls = { claim: [], fetchLocation: [], complete: [] }
  return {
    calls,
    deps: {
      claim: async (url) => {
        calls.claim.push(url)
        return claim
      },
      fetchLocation: async (id) => {
        calls.fetchLocation.push(id)
        return location
      },
      complete: async (key, name) => {
        calls.complete.push({ key, name })
        return true
      },
    },
  }
}

/** 記録する fake の request。respond(req) で応答の出し方を決める。 */
function fakeRequest(respond) {
  const log = { calls: [], destroyed: 0, dataListeners: 0, req: null }
  const request = (url, options) => {
    const req = new EventEmitter()
    req.destroy = () => {
      log.destroyed += 1
    }
    req.end = () => respond(req)
    const on = req.on.bind(req)
    req.on = (event, fn) => on(event, fn)
    log.calls.push({ url, options })
    log.req = req
    return req
  }
  return { request, log }
}

function response(statusCode, headers, log) {
  const res = new EventEmitter()
  res.statusCode = statusCode
  res.headers = headers
  const on = res.on.bind(res)
  res.on = (event, fn) => {
    if (event === 'data') log.dataListeners += 1
    return on(event, fn)
  }
  return res
}

const AGENT = { tag: 'agent' }

describe('W-SR1 短い URL でない物は claim も取得もしない', () => {
  for (const url of [
    'https://example.com/a',
    'http://maps.app.goo.gl/x',
    'https://u:p@maps.app.goo.gl/x',
    'https://maps.app.goo.gl:444/x',
    'https://maps.app.goo.gl/a/b',
  ]) {
    it(url, async () => {
      const { deps, calls } = makeDeps()
      assert.deepEqual(await runShareResolve(url, deps), { ok: false, reason: 'not_maps_short_url' })
      assert.equal(calls.claim.length, 0)
      assert.equal(calls.fetchLocation.length, 0)
    })
  }
})

describe('runShareResolve', () => {
  it('W-SR2 Location が長い URL → 店名・complete 1 回(名前つき)・id と正規の URL だけ渡す', async () => {
    const { deps, calls } = makeDeps()
    const result = await runShareResolve('https://maps.app.goo.gl/AbCdEf123?g_st=ic#x', deps)
    assert.deepEqual(result, { ok: true, query: '晴れ間食堂' })
    assert.deepEqual(calls.fetchLocation, ['AbCdEf123'])
    assert.deepEqual(calls.claim, ['https://maps.app.goo.gl/AbCdEf123'])
    assert.deepEqual(calls.complete, [{ key: 'k1', name: '晴れ間食堂' }])
  })

  for (const [label, location] of [
    ['他ホスト', 'https://evil.example/?q=x'],
    ['google.com の検索(/maps 以外)', 'https://www.google.com/search?q=abc'],
    ['座標の形', 'https://maps.google.com?q=35.6581,139.7017'],
    ['null', null],
  ]) {
    it(`W-SR3 ${label} → unavailable・complete 1 回(null)`, async () => {
      const { deps, calls } = makeDeps({ location })
      assert.deepEqual(await runShareResolve('https://maps.app.goo.gl/AbCdEf123', deps), {
        ok: false,
        reason: 'unavailable',
      })
      assert.deepEqual(calls.complete, [{ key: 'k1', name: null }])
    })
  }

  it('W-SR4 抑制: cachedTitle あり → それを返す・空 → unavailable・どちらも取得しない', async () => {
    const hit = makeDeps({ claim: { allowed: false, cachedTitle: '晴れ間食堂' } })
    assert.deepEqual(await runShareResolve('https://maps.app.goo.gl/AbCdEf123', hit.deps), {
      ok: true,
      query: '晴れ間食堂',
    })
    assert.equal(hit.calls.fetchLocation.length, 0)
    assert.equal(hit.calls.complete.length, 0)
    const miss = makeDeps({ claim: { allowed: false, cachedTitle: '' } })
    assert.deepEqual(await runShareResolve('https://maps.app.goo.gl/AbCdEf123', miss.deps), {
      ok: false,
      reason: 'unavailable',
    })
    assert.equal(miss.calls.fetchLocation.length, 0)
  })

  it('取得が投げても complete を呼んで unavailable', async () => {
    const { deps, calls } = makeDeps()
    deps.fetchLocation = async () => {
      throw new Error('boom')
    }
    assert.deepEqual(await runShareResolve('https://maps.app.goo.gl/AbCdEf123', deps), {
      ok: false,
      reason: 'unavailable',
    })
    assert.deepEqual(calls.complete, [{ key: 'k1', name: null }])
  })
})

describe('readRedirectLocation', () => {
  it('W-SR5 302 + location → その location。query なしの URL・GET・accept と user-agent だけ・agent を渡す', async () => {
    const holder = { log: null }
    const { request, log } = fakeRequest((req) => {
      req.emit('response', response(302, { location: LONG_URL }, holder.log))
    })
    holder.log = log
    assert.equal(await readRedirectLocation(request, 'AbCdEf123', { agent: AGENT }), LONG_URL)
    const [call] = log.calls
    assert.equal(call.url, 'https://maps.app.goo.gl/AbCdEf123')
    assert.equal(call.options.method, 'GET')
    assert.deepEqual(Object.keys(call.options.headers).sort(), ['accept', 'user-agent'])
    assert.equal(call.options.agent, AGENT)
    assert.equal(log.calls.length, 1)
  })

  const cases = [
    ['200', (req, log) => req.emit('response', response(200, { location: LONG_URL }, log))],
    ['404', (req, log) => req.emit('response', response(404, {}, log))],
    ['location なしの 302', (req, log) => req.emit('response', response(302, {}, log))],
    ['error', (req) => req.emit('error', new Error('x'))],
  ]
  for (const [label, act] of cases) {
    it(`W-SR6 ${label} → null・本文を読まない・destroy を呼ぶ`, async () => {
      const holder = { log: null }
      const { request, log } = fakeRequest((req) => act(req, holder.log))
      holder.log = log
      assert.equal(await readRedirectLocation(request, 'AbCdEf123', { agent: AGENT }), null)
      assert.equal(log.dataListeners, 0)
      assert.ok(log.destroyed >= 1)
    })
  }

  it('W-SR7 応答が来ない → 締切で null', { timeout: 1000 }, async () => {
    const { request, log } = fakeRequest(() => {})
    assert.equal(await readRedirectLocation(request, 'AbCdEf123', { agent: AGENT, timeoutMs: 50 }), null)
    assert.ok(log.destroyed >= 1)
  })
})

describe('W-SR8 ソースの照合', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const read = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'))
  const deps = read('../share-resolve-deps.ts')
  const files = {
    core: read('../share-resolve-core.ts'),
    deps,
    route: read('../../../app/api/mobile/v1/share/resolve/route.ts'),
  }

  it('(a) agent の lookup に guardedLookup を渡す', () => {
    assert.equal((deps.match(/new HttpsAgent\(\{[^}]*\blookup:\s*guardedLookup\b/g) ?? []).length, 1)
  })
  it("(b) node:http(s なし)を import しない", () => {
    assert.equal((deps.match(/node:http'/g) ?? []).length, 0)
  })
  it('(c) console を使わない', () => {
    for (const [name, src] of Object.entries(files)) assert.equal((src.match(/console\./g) ?? []).length, 0, name)
  })
  it('Places の受け口・Details を import しない', () => {
    for (const [name, src] of Object.entries(files)) {
      assert.doesNotMatch(src, /mobile-places|\/details['"]/, name)
    }
  })
})
