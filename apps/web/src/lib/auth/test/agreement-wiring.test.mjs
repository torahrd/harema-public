// T-6(f)(g): 同意の記録の配線(ソースを読む検査)。route.ts・login-client.ts は next/server・fetch・Firebase SDK を
// import するので node --test で読めない。ソースの形だけを見る。実際の呼び出しは local の stack(TEST.md の 3-1)で確かめた。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  // コメントを除いたコード部分だけを見る(注釈の語で通らないように)
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('T-6(f) login-client.ts は目印(agreed: true)だけを渡す', () => {
  const code = read('../../../app/login/login-client.ts')
  it('runSsoLogin の agreed に true を渡す。番号・日付の定数を import しない', () => {
    assert.match(code, /agreed:\s*true\b/)
    assert.doesNotMatch(code, /LEGAL_VERSIONS|LEGAL_REVISIONS/)
  })
})

describe('T-6(g) route.ts は acceptLogin に記録の口と目印の確かめを渡す', () => {
  const code = read('../../../app/auth/session/route.ts')
  it('recordAgreement(lib/auth/agreement)と shared の Zod の目印の確かめを渡す', () => {
    assert.match(code, /import\s*\{\s*recordAgreement\s*\}\s*from\s*'@\/lib\/auth\/agreement'/)
    assert.match(code, /import\s*\{\s*agreedMarkSchema\s*\}\s*from\s*'@harema\/shared\/validations'/)
    assert.match(code, /recordAgreement:\s*async\s*\(idToken\)\s*=>/)
    assert.match(code, /await recordAgreement\(idToken\)/)
    assert.match(code, /parseAgreed:/)
    assert.match(code, /agreedMarkSchema\.safeParse\(/)
  })
})

describe('D-4 route.ts は記録の失敗の種類だけを console.warn に残す', () => {
  const code = read('../../../app/auth/session/route.ts')
  it('failed の時だけ、固定の文を 1 行出す。ID トークン・sub を出さない', () => {
    assert.match(code, /if \(outcome === 'failed'\) console\.warn\('\[auth\/session\] record_agreement failed'\)/)
    const warns = code.match(/console\.warn\([^)]*\)/g) ?? []
    assert.equal(warns.length, 1)
    assert.doesNotMatch(warns[0], /idToken|agreed|sub|token/i)
  })
})

describe('agreement.ts(検証済みの ID トークンで DB の関数を呼ぶ口)', () => {
  const code = read('../agreement.ts')
  it('server-only・要求ごとの client(createTokenSupabase)・secret key を使わない・投げない', () => {
    assert.match(code, /import 'server-only'/)
    assert.match(code, /createTokenSupabase\(idToken\)/)
    // 記録する番号は DB が決める(recordCurrentAgreement = 引数なしの record_agreement)。画面が送った値を書かない
    assert.match(code, /recordCurrentAgreement\(createTokenSupabase\(idToken\)\)/)
    assert.doesNotMatch(code, /agreed\.terms|agreed\.privacy|LEGAL_VERSIONS|LEGAL_REVISIONS/)
    assert.doesNotMatch(code, /secret|service_role|SERVICE/i)
  })
  it('ID を引数で渡さない(書く ID は DB の関数が sub から決める)', () => {
    assert.doesNotMatch(code, /user_id|p_user|p_sub/)
  })
})
