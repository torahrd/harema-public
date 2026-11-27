// lists-screen T3・T4・T5: 「リスト」の画面(/lists)の配線(ソースの照合)。実行: `pnpm --filter web test`
// 画面の部品の値(頭・数の札)が一覧と同じこと、メニューの出し分け、編集の入口を外したこと。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/** コメントを除く(コメントに書いた語で照合が動かないように)。 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (p) => stripComments(readFileSync(new URL(p, import.meta.url), 'utf8'))
const listsScreen = read('../../../app/lists/lists-screen.tsx')
const savedScreen = read('../../../app/saved/saved-list-screen.tsx')
const drawer = read('../../../app/account/drawer.tsx')
const mapScreen = read('../../../app/map/map-screen.tsx')
const chips = read('../../../app/lists/list-chips.tsx')
const sheet = read('../../../app/lists/list-sheet.tsx')
const ja = read('../../../../../../packages/shared/i18n/ja.ts')

describe('lists-screen T3 行と開く先', () => {
  it('FullViewportShell を使い、ROW_STYLE・IconSlot は ./list-sheet から取る(行内に同じ style を書き足さない)', () => {
    assert.match(listsScreen, /<FullViewportShell>/)
    assert.match(listsScreen, /import \{ IconSlot, ROW_STYLE \} from '\.\/list-sheet'/)
    assert.match(listsScreen, /\.\.\.ROW_STYLE/)
    assert.match(listsScreen, /<IconSlot icon=\{list\.icon\} \/>/)
  })
  it('「+ 新しいリスト」の行がリストの行の map より前にある・題は label', () => {
    const newRow = listsScreen.indexOf("t('newList')")
    const rows = listsScreen.indexOf('lists.map(')
    assert.ok(newRow > 0 && rows > newRow)
    assert.match(listsScreen, /\{t\('label'\)\}/)
  })
  it('「+」は list を渡さず(作る)、行は自分のリストを渡す(更新・削除)。閉じるのは onClosed', () => {
    assert.match(listsScreen, /onClick=\{\(\) => setEditor\(\{\}\)\}/)
    assert.match(listsScreen, /setEditor\(\{\s*list: \{ id: list\.id/)
    assert.match(listsScreen, /<ListEditorSheet zBase=\{20\} list=\{editor\.list\} onClosed=\{\(\) => setEditor\(null\)\} \/>/)
  })
  it('router.refresh・地図・Places を使わない', () => {
    assert.doesNotMatch(listsScreen, /router\.refresh|\.refresh\(\)|APIProvider|useMapsLibrary|@vis\.gl|places\//)
  })
  it('本体は縦に動く(頭は動かない)', () => {
    assert.match(listsScreen, /flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px'/)
  })
})

describe('lists-screen T4 頭と数の札が一覧と同じ値', () => {
  const headValues = [
    'height: 52',
    'gap: 12',
    "padding: '0 16px'",
    'width: 36',
    'height: 36',
    "'1px solid var(--border)'",
    "'var(--radius-control)'",
    'heading(18)',
    'M15 6l-6 6 6 6',
  ]
  const countValues = [
    '...NUM',
    'fontSize: 11',
    "lineHeight: '16px'",
    "'var(--bg-sunken)'",
    "'var(--radius-chip)'",
    "padding: '1px 6px'",
  ]
  for (const [label, values] of [
    ['頭', headValues],
    ['数の札', countValues],
  ]) {
    for (const value of values) {
      it(`${label}: ${value} が両方のファイルにある`, () => {
        assert.ok(listsScreen.includes(value), `lists-screen.tsx に ${value} が無い`)
        assert.ok(savedScreen.includes(value), `saved-list-screen.tsx に ${value} が無い`)
      })
    }
  }
  it('戻るは解決済みの絞りを付けた /map(消えたリスト・他人の id は引き継がない)', () => {
    assert.match(listsScreen, /pathWithList\('\/map', resolveSelectedList\(carriedListId, lists\)\)/)
  })
})

describe('lists-screen T5 メニューと、編集の入口を外したこと', () => {
  it('drawer: listsHref の時だけ「リスト」を出し(押すと router.push)、「保存した店」より後・「ユーザー名変更」より前・新しい鍵を足さない', () => {
    assert.match(
      drawer,
      /\{listsHref !== undefined && \(\s*<button[^>]*onClick=\{\(\) => closeAnd\(\(\) => router\.push\(listsHref\)\)\}[^>]*className="qs-it"/,
    )
    const saved = drawer.indexOf("{t('itemSaved')}")
    const lists = drawer.indexOf("{listsT('label')}")
    const username = drawer.indexOf("{t('itemUsername')}")
    assert.ok(saved > 0 && lists > saved && username > lists)
    assert.doesNotMatch(ja, /itemLists/)
  })
  it('map-screen: 同意した人にだけ listsHref を渡す(絞りを付けて)', () => {
    assert.ok(mapScreen.includes("listsHref={listsOpen ? pathWithList('/lists', activeListId) : undefined}"))
  })
  it('list-chips: 「編集」の入口が無く、高さ 44 の器と目印は残る', () => {
    assert.doesNotMatch(chips, /onEdit|t\('edit'\)|t\('editLabel'\)/)
    assert.match(chips, /height: 44/)
    assert.match(chips, /data-testid="list-chips"/)
  })
  it('list-sheet・一覧の画面: mode="edit"・onEditPick・編集のシートの状態が無い', () => {
    assert.doesNotMatch(sheet, /'edit'|onEditPick/)
    assert.doesNotMatch(savedScreen, /editSheetOpen|mode="edit"|onEdit\b|onEditPick/)
  })
  it('辞書: web.lists の edit・editLabel が無く、editTitle(名前とアイコンのシートの題)は残る', () => {
    const start = ja.indexOf('lists: {')
    const block = ja.slice(start, ja.indexOf('\n    },', start))
    assert.doesNotMatch(block, /\n\s+edit:|\n\s+editLabel:/)
    assert.match(block, /editTitle:/)
  })
})
