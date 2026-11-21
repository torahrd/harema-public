// 日本語の文字を含む文字列・テンプレート・JSX の文を、テストを除く .ts・.tsx の構文木から数え上げる部品。
// 記録(i18n 単位の strings-list.mjs)の写しで、repo の根を引数に取る形にした。
// 使い方: `listStrings(repoRoot)` → [面, 相対パス, 行, 文言] の並び(面は下の area の値)。
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const JA = /[぀-ヿ一-鿿]/
const SKIP_DIRS = ['node_modules', 'test', 'tests', '.next', 'scripts']

export const AREA = {
  A: 'A 共有',
  B: 'B web のアプリ画面',
  C: 'C mobile',
  D: 'D 公開ページ',
  E: 'E 規約とポリシー',
  F: 'F coming-soon(範囲外の候補)',
  X: 'X 開発用(訳さない)',
}

function area(rel) {
  if (/^apps\/mobile\/(src\/dev\/|src\/map\/state-gallery|map-probe|verify-hud|src\/map\/font-slots|map-style|app\.config)/.test(rel)) return AREA.X
  if (rel.startsWith('apps/mobile')) return AREA.C
  if (rel.includes('_public/legal.ts')) return AREA.E
  if (rel.includes('/coming-soon/')) return AREA.F
  // 公開ページは route group (site) の下か、_public・news・terms・privacy・about の部品。
  if (/src\/app\/(\(site\)|_public|en\/|page\.tsx|news|terms|privacy|about)/.test(rel)) return AREA.D
  if (rel.startsWith('packages/shared')) return AREA.A
  return AREA.B
}

function walk(dir, files) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.includes(e.name)) continue
      walk(p, files)
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec|d)\.tsx?$/.test(e.name)) {
      files.push(p)
    }
  }
}

/** 例外の文・エラーの文・ログの文(開発者向け)は数えない面 X に回す。 */
function isDev(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isThrowStatement(p)) return true
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true
    if (ts.isCallExpression(p) && /^(console\.|assert|invariant|warn)/.test(p.expression.getText())) return true
  }
  return false
}

export function listStrings(root) {
  const files = []
  for (const d of ['apps/web/src', 'apps/mobile', 'packages/shared']) walk(path.join(root, d), files)
  const rows = []
  for (const f of files.sort()) {
    const rel = path.relative(root, f).split(path.sep).join('/')
    const src = fs.readFileSync(f, 'utf8')
    const kind = f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, kind)
    const visit = (n) => {
      let text = null
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
      else if (ts.isTemplateExpression(n)) text = n.getText()
      else if (ts.isJsxText(n)) text = n.text
      if (text !== null && JA.test(text)) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        rows.push([isDev(n) ? AREA.X : area(rel), rel, line, text.replace(/\s+/g, ' ').trim()])
        if (ts.isTemplateExpression(n)) return
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2] - b[2])
  return rows
}
