// T4: 配線(ソースの照合)。核の順序・Server Action の取り直し・deps の条件。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/** コメントを除く(コメントに書いた語で照合が動かないように)。 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (p) => stripComments(readFileSync(new URL(p, import.meta.url), 'utf8'))
const core = read('../bulk-core.ts')
const deps = read('../bulk-deps.ts')
const actions = read('../../../app/saved/bulk-actions.ts')

/** `export async function <name>(` から次の `export ` まで(最後は終わりまで)。 */
function block(source, name) {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `${name} が無い`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next < 0 ? undefined : next)
}

describe('T4(a) 核は Zod → getUser → openDb の順で呼ぶ', () => {
  for (const name of ['runBulkChangeStatus', 'runBulkDeleteSavedPlaces']) {
    it(name, () => {
      const body = block(core, name)
      const parse = body.indexOf('.safeParse(')
      const user = body.indexOf('env.getUser()')
      const open = body.indexOf('env.openDb()')
      assert.ok(parse >= 0 && user >= 0 && open >= 0)
      assert.ok(parse < user && user < open, '順序が Zod → getUser → openDb でない')
      assert.ok(body.includes("reason: 'unauthenticated'"))
    })
  }
  it('核の値の import は shared の Zod だけ(DB・cookie・admin を import しない)', () => {
    const imports = [...core.matchAll(/(?:^|\n)import\s[\s\S]*?\sfrom\s+'([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(imports, ['@harema/shared/validations'])
  })
})

describe('T4(b) Server Action', () => {
  const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1])
  it('export は 2 つだけ', () => {
    assert.deepEqual(exported.sort(), ['bulkChangeStatus', 'bulkDeleteSavedPlaces'])
  })
  const cores = { bulkChangeStatus: 'runBulkChangeStatus', bulkDeleteSavedPlaces: 'runBulkDeleteSavedPlaces' }
  for (const [name, run] of Object.entries(cores)) {
    it(`${name} は核 ${run} を(input, env())で呼び、成功の枝でだけ取り直す`, () => {
      const body = block(actions, name)
      assert.ok(body.includes(`${run}(input, env())`))
      assert.match(body, /if \(result\.ok\) revalidateSavedPages\(\)/)
      assert.equal((body.match(/revalidateSavedPages\(\)/g) ?? []).length, 1)
    })
  }
  it('取り直しは /map と /saved の 2 つ。redirect も cookie も使わない', () => {
    const fn = actions.slice(actions.indexOf('function revalidateSavedPages'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    assert.deepEqual([...body.matchAll(/revalidatePath\('([^']+)'\)/g)].map((m) => m[1]), ['/map', '/saved'])
    assert.ok(!/redirect\(|cookies\(/.test(actions))
  })
  it('getVerifiedUser と要求ごとの client(openDb の中)を使う', () => {
    assert.ok(actions.includes('getUser: getVerifiedUser'))
    assert.ok(actions.includes('openDb: async () => createBulkDeps(await createUserSupabase())'))
  })
})

describe('T4(c) deps', () => {
  it("server-only を import する", () => {
    assert.ok(deps.includes("import 'server-only'"))
  })
  it('update は user_id・id・status の 3 条件', () => {
    const body = deps.slice(deps.indexOf('updateStatus:'), deps.indexOf('deleteSavedPlaces:'))
    assert.ok(body.includes(".eq('user_id', userId)"))
    assert.ok(body.includes(".in('id', savedPlaceIds)"))
    assert.ok(body.includes(".eq('status', from)"))
  })
  it('delete は user_id・id の 2 条件', () => {
    const body = deps.slice(deps.indexOf('deleteSavedPlaces:'))
    assert.ok(body.includes(".eq('user_id', userId)"))
    assert.ok(body.includes(".in('id', savedPlaceIds)"))
  })
})

describe('T4(d) 3 ファイル共通', () => {
  for (const [name, src] of Object.entries({ core, deps, actions })) {
    it(`${name}: admin の入口を import しない・createUserSupabase を module scope で呼ばない`, () => {
      assert.ok(!src.includes('@/lib/supabase/admin'))
      // module scope = 関数の外の行頭。行頭(インデント無し)に createUserSupabase( がある物を探す。
      assert.ok(!/^[^\s].*createUserSupabase\(/m.test(src.replace(/^import .*$/gm, '')))
    })
  }
})
