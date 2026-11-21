// 規約・ポリシーの行き先は、言語に従って shared の legalPath だけが決める(web の 5 か所。mobile は apps/mobile の test)。
// 直書き(引用符で囲んだ /terms・/privacy・/en/terms・/en/privacy)が、アプリの画面に 0 件であることを守る。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { legalPath } from '../../../../../packages/shared/i18n/legal-path.ts'

const APP = fileURLToPath(new URL('../../app/', import.meta.url))

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'test' || name === 'node_modules' ? [] : sourceFiles(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// 正規表現は、必ず当たる fixture(今のソースの該当の行の写し)を先に照らしてから使う。0 件に化けたら落ちる。
const LITERAL = /(['"`])\/(?:en\/)?(?:terms|privacy)\1/
for (const sample of [`<Link href="/terms" onClick={x}>`, `<a href='/en/privacy' target="_blank">`, 'href={`/privacy`}']) {
  assert.match(sample, LITERAL, `fixture が当たらない(正規表現が壊れている): ${sample}`)
}

describe('legalPath(規約・ポリシーの行き先)', () => {
  it('言語ごとの 4 通り', () => {
    assert.equal(legalPath('ja', 'terms'), '/terms')
    assert.equal(legalPath('ja', 'privacy'), '/privacy')
    assert.equal(legalPath('en', 'terms'), '/en/terms')
    assert.equal(legalPath('en', 'privacy'), '/en/privacy')
  })

  it('入力の文字列を混ぜない(想定外の入力でも、返すのは定数の 4 つだけ)', () => {
    const allowed = new Set(['/terms', '/privacy', '/en/terms', '/en/privacy'])
    for (const locale of ['ja', 'en']) for (const name of ['terms', 'privacy']) assert.ok(allowed.has(legalPath(locale, name)))
    // 型を外れた入力(実行時の話)は、入力をそのまま返さず投げる。
    assert.throws(() => legalPath('//evil.example', 'terms'), TypeError)
  })

  it('web のアプリの画面(login・account・(app))に、行き先の直書きが 0 件で、legalPath の呼び出しが 5 本', () => {
    const files = [...sourceFiles(join(APP, 'login')), ...sourceFiles(join(APP, 'account')), ...sourceFiles(join(APP, '(app)'))]
    assert.ok(files.length > 10, `走査したファイルが少なすぎる: ${files.length}`)
    let calls = 0
    for (const f of files) {
      const body = readFileSync(f, 'utf8')
      assert.doesNotMatch(body, LITERAL, `${f} に規約・ポリシーの行き先が直書きされている`)
      calls += (body.match(/legalPath\(/g) ?? []).length
    }
    assert.equal(calls, 5, '同意の 2 つ・足の PRIVACY 1 つ・メニューの 2 行で 5 本')
  })
})
