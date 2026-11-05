// /login が、ログイン済みの人を /map へ送ることの静的な確かめ(web-stay-login)。
// page.tsx は next/navigation を import するので node --test で読めない。ソースの形だけを見る。
// 実際の振る舞い(307 と、DB の失効・故障で画面を出すこと)は build + start の E2E で確かめる。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const source = readFileSync(new URL('../../../app/login/page.tsx', import.meta.url), 'utf8')
// コメントを除いたコード部分だけを見る(注釈の語で通らないように)
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('login/page.tsx(ログイン済みは /map へ)', () => {
  it('async の Server Component で、getVerifiedUser() の結果で redirect(\'/map\') する', () => {
    assert.match(code, /export default async function LoginPage\(/)
    assert.match(code, /getVerifiedUser\s*\}\s*from\s*'@\/lib\/auth\/session'/)
    assert.match(code, /if\s*\(\s*await\s+getVerifiedUser\(\)\s*\)\s*redirect\('\/map'\)/)
  })

  it('cookie の有無だけで判定しない(cookies() を読まない)', () => {
    assert.doesNotMatch(code, /cookies\s*\(/)
    assert.doesNotMatch(code, /next\/headers/)
  })
})
