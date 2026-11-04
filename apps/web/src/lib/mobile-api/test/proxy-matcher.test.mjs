// mobile の受け口は proxy(cookie の更新)を通らない(spec §11.1-10「受け口の木は cookie を読まない・書かない」)。
// proxy.ts は updateSession を import するので読み込まず、export された matcher の文字列を取り出して
// Next.js の unstable_doesMiddlewareMatch で照らす。
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server.js'

const source = readFileSync(new URL('../../../proxy.ts', import.meta.url), 'utf8')
const block = source.match(/matcher:\s*\[([\s\S]*?)\]/)
assert.ok(block, 'proxy.ts に matcher の配列がある')
const matcher = [...block[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) =>
  m[1].replace(/\\\\/g, '\\'),
)
const config = { matcher }
const matches = (path) => unstable_doesMiddlewareMatch({ config, url: `https://harema.test${path}` })

describe('proxy の matcher', () => {
  it('matcher の文字列を 1 つ以上取り出せる(取り出しが壊れて空で通らない)', () => {
    assert.ok(matcher.length >= 1)
  })
  for (const path of [
    '/api/mobile/v1/places/autocomplete',
    '/api/mobile/v1/places/details',
    '/api/mobile/v1/saved-places',
    '/api/mobile/v1/source-title',
  ]) {
    it(`mobile の受け口 ${path} は proxy を通らない`, () => {
      assert.equal(matches(path), false)
    })
  }
  for (const path of ['/', '/map', '/saved', '/api/cron/refresh-places', '/api/mobilex']) {
    it(`${path} は今までどおり proxy を通る`, () => {
      assert.equal(matches(path), true)
    })
  }
  it('auth/session は今までどおり proxy を通らない', () => {
    assert.equal(matches('/auth/session'), false)
  })
})
