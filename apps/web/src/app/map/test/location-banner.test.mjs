// 位置情報オフの帯の本文の折れ方(所有者 2026-11-03 17:44 JST)。
// 実行: `pnpm --filter web test`(source を文字列で読む)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const banner = readFileSync(new URL('../location-permission-banner.tsx', import.meta.url), 'utf8')

describe('位置情報オフの帯', () => {
  it('「。」の後で必ず行を変え、2 文目は句ごとの塊で並べる', () => {
    assert.match(banner, /\[\[LOCATION_DENIED_MESSAGE\[0\]\], LOCATION_DENIED_MESSAGE\.slice\(1\)\]\.map\(/)
    assert.match(banner, /<span key=\{sentence\.join\(''\)\} style=\{\{ display: 'block' \}\}>/)
  })
  it('字は META のまま(書体・大きさを足さない)', () => {
    assert.match(banner, /\.\.\.META,\n\s*color: 'var\(--fg-1\)'/)
    assert.doesNotMatch(banner, /fontSize|fontFamily/)
  })
})
