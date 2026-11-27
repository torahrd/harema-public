// 位置情報オフの帯の本文の折れ方(所有者 2026-11-03 17:44 JST)。
// 実行: `pnpm --filter web test`(source を文字列で読む)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const banner = readFileSync(new URL('../location-permission-banner.tsx', import.meta.url), 'utf8')
// 外枠(点・文の欄・閉じる ×)は、店の無いリストの知らせと共通の器へ切り出した(単位 lists-filter-carry)。
const card = readFileSync(new URL('../map-notice-card.tsx', import.meta.url), 'utf8')

describe('位置情報オフの帯', () => {
  it('「。」の後で必ず行を変え、2 文目は句ごとの塊で並べる', () => {
    assert.match(banner, /\[denied\.slice\(0, 1\), denied\.slice\(1\)\]\.map\(/)
    assert.match(banner, /<span key=\{sentence\.join\(''\)\} style=\{\{ display: 'block' \}\}>/)
  })
  it('字は META のまま(書体・大きさを足さない)', () => {
    assert.match(card, /\.\.\.META,\n\s*color: 'var\(--fg-1\)'/)
    assert.doesNotMatch(banner, /fontSize|fontFamily/)
    assert.doesNotMatch(card, /fontSize|fontFamily/)
  })
})
