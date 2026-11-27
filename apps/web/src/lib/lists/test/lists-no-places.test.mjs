// T-P2: リストの部品は Places の取得を import しない(import の行だけを見る。コメントは見ない)。
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const dirs = [new URL('../', import.meta.url), new URL('../../../app/lists/', import.meta.url)]
const FORBIDDEN = ['lib/places', 'details-cache', '@vis.gl/react-google-maps']

/** `import ... from '...'` と `import '...'` と `import('...')` の指定子を拾う。 */
function importSpecifiers(source) {
  const found = []
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g)) found.push(m[1])
  for (const m of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1])
  return found
}

describe('T-P2 リストの部品は Places を import しない', () => {
  for (const dir of dirs) {
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))
    it(`${dir.pathname.split('/src/')[1]} に対象のファイルがある`, () => {
      assert.ok(files.length > 0)
    })
    for (const file of files) {
      it(file, () => {
        const specs = importSpecifiers(readFileSync(new URL(file, dir), 'utf8'))
        for (const spec of specs) {
          for (const bad of FORBIDDEN) assert.ok(!spec.includes(bad), `${file} が ${spec} を import している`)
        }
      })
    }
  }
})
