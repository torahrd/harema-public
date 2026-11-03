// LR-S(login-replace の静的検査)の規則の自己診断を、`pnpm --filter web test` で毎回通す。
// 壊れた規則が 0 件を返して緑になるのを防ぐのが目的。実際の木は走査しない(それは tools/login-checks の CLI)。
// このファイルは apps/web/src にあり LR-S1 の走査対象なので、禁止語を直書きしない(語は rules.mjs の fixture にだけある)。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RULES, scanText, selfTest } from '../../../../../../tools/login-checks/lib/rules.mjs'

const result = selfTest()

describe('LR-S の自己診断(fixture ごと)', () => {
  assert.ok(result.fixtures.length > 0, 'fixture が 0 本(自己診断が空回りしている)')
  for (const fixture of result.fixtures) {
    it(`${fixture.ruleId} [${fixture.kind}] ${fixture.label}`, () => {
      assert.equal(
        fixture.pass,
        true,
        `${fixture.kind} の期待と食い違う: ${JSON.stringify(fixture.source)}(一致 = ${fixture.matched})`,
      )
    })
  }
})

describe('LR-S の規則の宣言', () => {
  it('規則が 1 本以上ある', () => {
    assert.ok(RULES.length > 0)
  })

  it('規則の id が重複しない', () => {
    const ids = RULES.map((r) => r.id)
    assert.equal(new Set(ids).size, ids.length, `重複: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`)
  })

  it('全規則が must-match の fixture を 1 本以上持つ(宣言と自己診断の結果の両方)', () => {
    for (const rule of RULES) {
      assert.ok((rule.fixtures?.mustMatch ?? []).length >= 1, `${rule.id} の宣言に must-match が無い`)
      assert.ok(
        result.fixtures.some((f) => f.ruleId === rule.id && f.kind === 'must-match' && f.source !== ''),
        `${rule.id} の自己診断に must-match が無い`,
      )
    }
  })

  it('全規則が must-not-match の fixture を 1 本以上持つ', () => {
    for (const rule of RULES) {
      assert.ok((rule.fixtures?.mustNotMatch ?? []).length >= 1, `${rule.id} に must-not-match が無い`)
    }
  })
})

describe('scanText', () => {
  it('1 行に複数のヒットがあれば複数を返す', () => {
    const rule = RULES.find((r) => r.id.startsWith('LR-S1:') && r.kind === 'pattern')
    assert.ok(rule, 'LR-S1 のパターン規則が無い')
    const one = rule.fixtures.mustMatch[0].source
    const hits = scanText(rule, 'apps/web/src/example.ts', `${one} ${one}`)
    assert.equal(hits.length, 2)
    assert.deepEqual(
      hits.map((h) => h.line),
      [1, 1],
    )
  })

  it('ヒットは { file, line, text } を持ち、line は 1 始まりで複数行を区別する', () => {
    const rule = RULES.find((r) => r.id.startsWith('LR-S1:') && r.kind === 'pattern')
    const one = rule.fixtures.mustMatch[0].source
    const hits = scanText(rule, 'apps/web/src/example.ts', `// 無関係\n${one}\n\n${one}\n`)
    assert.deepEqual(
      hits.map((h) => [h.file, h.line]),
      [
        ['apps/web/src/example.ts', 2],
        ['apps/web/src/example.ts', 4],
      ],
    )
    assert.ok(hits.every((h) => typeof h.text === 'string' && h.text.length > 0))
  })

  it('一致しない文字列には空配列を返す', () => {
    const rule = RULES.find((r) => r.id.startsWith('LR-S1:') && r.kind === 'pattern')
    assert.deepEqual(scanText(rule, 'apps/web/src/example.ts', 'export const a = 1\n'), [])
  })
})

describe('legal.ts も走査する(pattern 規則に走査から外すファイルは無い)', () => {
  const legalPath = 'apps/web/src/app/_public/legal.ts'

  it('pattern 規則は走査から外すパスを持たない', () => {
    const excluding = RULES.filter((r) => r.kind === 'pattern' && r.excludePath)
    assert.equal(excluding.length, 0, `除外を持つ pattern 規則: ${excluding.map((r) => r.id).join(', ')}`)
  })

  it('pattern 規則は legal.ts も走査する(LR-S1 の全ての語)', () => {
    for (const rule of RULES.filter((r) => r.kind === 'pattern' && r.files.includes('src'))) {
      const source = rule.fixtures.mustMatch[0].source
      assert.ok(scanText(rule, legalPath, source).length >= 1, `${rule.id} が legal.ts を走査しない`)
    }
  })
})
