// T-A6(配線): リストの門(同意した人にだけ開く)。page 3 つ・Server Action・保存の入れ替え・画面 4 つが、listsOpen が偽の間
// リストを読まない・出さない配線であること(ソースの照合)。実行: `pnpm --filter web test`。DB の門そのものは pgTAP(17_lists_gate.sql)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/** コメントを除く(コメントに書いた語で照合が動かないように)。 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (p) => stripComments(readFileSync(new URL(p, import.meta.url), 'utf8'))

const mapPage = read('../../../app/(app)/map/page.tsx')
const savedPage = read('../../../app/(app)/saved/page.tsx')
const listsPage = read('../../../app/(app)/lists/page.tsx')
const placePage = read('../../../app/(app)/places/[id]/page.tsx')
const actions = read('../../../app/lists/list-actions.ts')
const saveActions = read('../../../app/map/save-actions.ts')
const mapScreen = read('../../../app/map/map-screen.tsx')
const saveSheet = read('../../../app/map/save-sheet.tsx')
const savedScreen = read('../../../app/saved/saved-list-screen.tsx')
const placeScreen = read('../../../app/places/[id]/place-detail-screen.tsx')

describe('T-A6 page 3 つは listsOpen が偽ならリストを読まない', () => {
  it('map の page は閉じている間リストを読まない(readLists は listsOpen の枝だけ・listIds は空)', () => {
    assert.match(mapPage, /const agreement = await readAgreementState\(supabase\)/)
    assert.match(mapPage, /const listsOpen = agreement\.listsOpen/)
    assert.match(mapPage, /const lists = listsOpen \? await readLists\(supabase\) : \[\]/)
    assert.match(mapPage, /listIds: listsOpen \? row\.list_places\.map\(\(entry\) => entry\.list_id\) : \[\]/)
    assert.equal(mapPage.split('readLists(').length - 1, 1, 'readLists の呼びが 1 か所だけ')
    assert.match(mapPage, /<MapScreen[\s\S]*listsOpen=\{listsOpen\}/)
  })
  it('saved の page は閉じている間 readListsWithMembers を呼ばない(所属は空)', () => {
    assert.match(savedPage, /const listsOpen = \(await readAgreementState\(supabase\)\)\.listsOpen/)
    assert.match(savedPage, /listsOpen\s*\?\s*await readListsWithMembers\(supabase\)\s*:\s*\{ lists: \[\], membership: new Map/)
    assert.equal(savedPage.split('readListsWithMembers(').length - 1, 1)
    assert.match(savedPage, /<SavedListScreen[\s\S]*listsOpen=\{listsOpen\}/)
  })
  it('places/[id] の page は閉じている間 readLists を呼ばない(listIds は空)', () => {
    assert.match(placePage, /const listsOpen = \(await readAgreementState\(supabase\)\)\.listsOpen/)
    assert.match(placePage, /const lists = listsOpen \? await readLists\(supabase\) : \[\]/)
    assert.match(placePage, /listIds: listsOpen \? row\.list_places\.map\(\(entry\) => entry\.list_id\) : \[\]/)
    assert.equal(placePage.split('readLists(').length - 1, 1)
    assert.match(placePage, /<PlaceDetailScreen[\s\S]*listsOpen=\{listsOpen\}/)
  })
  it('3 つとも、同意の状態の読みは readAgreementState(失敗は閉じる側)だけを使う', () => {
    for (const src of [mapPage, savedPage, placePage]) {
      assert.match(src, /import \{ readAgreementState \} from '@\/lib\/auth\/consent-notice'/)
      assert.doesNotMatch(src, /listsOpen = true/)
    }
  })
})

describe('lists-screen T2 「リスト」の画面(/lists)の page の守りと門', () => {
  it('認証 → profiles → 同意の判定 → 閉じていれば /map → リストの読み、の順に並ぶ', () => {
    const marks = [
      'getVerifiedUser()',
      "redirect('/login')",
      'createUserSupabase()',
      ".from('profiles')",
      "redirect('/onboarding')",
      'readAgreementState(supabase)',
      'if (!listsOpen)',
      "redirect('/map')",
      'readListsWithMembers(supabase)',
    ]
    let at = -1
    for (const mark of marks) {
      const next = listsPage.indexOf(mark, at + 1)
      assert.ok(next > at, `${mark} が順の通りに無い`)
      at = next
    }
  })
  it('リストの読みは 1 か所・門を開けたままにしない・admin client と保存した店の読みと module scope の client が無い', () => {
    assert.equal(listsPage.split('readListsWithMembers(').length - 1, 1)
    assert.doesNotMatch(listsPage, /listsOpen = true/)
    assert.match(listsPage, /import \{ readAgreementState \} from '@\/lib\/auth\/consent-notice'/)
    assert.ok(!listsPage.includes('supabase/admin'))
    assert.ok(!listsPage.includes('saved_places'))
    const outside = listsPage.slice(0, listsPage.indexOf('export default async function'))
    assert.ok(!outside.includes('createUserSupabase('), 'module scope で client を作っている')
  })
})

describe('T-A6 Server Action と保存の入れ替え', () => {
  it('list-actions.ts の env() が listsOpen を readAgreementState から渡す', () => {
    assert.match(actions, /import \{ readAgreementState \} from '@\/lib\/auth\/consent-notice'/)
    assert.match(actions, /listsOpen: async \(\) => \(await readAgreementState\(await createUserSupabase\(\)\)\)\.listsOpen/)
  })
  it('保存のシートを開く時の所属(resolveSavedPlace)も、閉じている間は空', () => {
    assert.match(saveActions, /const listsOpen = \(await readAgreementState\(supabase\)\)\.listsOpen/)
    assert.match(saveActions, /listIds: listsOpen \? saved\.list_places\.map\(\(row\) => row\.list_id\) : \[\]/)
  })
})

describe('T-A6 画面 4 つは listsOpen が偽の間リストの部品を描かない(条件で包むだけ)', () => {
  it('map-screen: 札の列は listsOpen の時だけ・保存のシートへ listsOpen を渡す', () => {
    assert.match(mapScreen, /listsOpen && lists\.length > 0 && !isSearchActive && !chromeDisabled/)
    assert.match(mapScreen, /<SaveSheet\s+lists=\{lists\}\s+listsOpen=\{listsOpen\}/)
  })
  it('save-sheet: 「リスト」の行・リストを選ぶシート・名前とアイコンのシートは listsOpen の時だけ', () => {
    assert.match(saveSheet, /\{listsOpen && \(\s*<button\s+type="button"\s+data-testid="list-row"/)
    assert.match(saveSheet, /\{listsOpen && pickerOpen && \(/)
    assert.match(saveSheet, /\{listsOpen && newListOpen && \(/)
  })
  it('saved-list-screen: 「選ぶ」・札の段・行のアイコンの枠・2 つのシート・一括の帯は listsOpen の時だけ', () => {
    assert.match(savedScreen, /\{listsOpen && \(\s*<button\s+type="button"\s+data-testid="list-select"/)
    assert.match(savedScreen, /\{listsOpen && \(\s*<div style=\{\{ position: 'relative', flex: 'none' \}\}>\s*<ListChips/)
    assert.match(savedScreen, /showIconSlot=\{listsOpen && lists\.length > 0\}/)
    assert.match(savedScreen, /\{listsOpen && bulkSheet !== null && \(/)
    assert.match(savedScreen, /\{listsOpen && newListOpen && \(/)
    assert.match(savedScreen, /\{listsOpen && selecting && \(/)
  })
  it('saved-list-screen: 一括の状態を選ぶ段と一括の削除の確認も listsOpen の時だけ(lists-bulk の T5 の門の項)', () => {
    assert.match(savedScreen, /\{listsOpen && statusSheetOpen && \(\s*<StatusPickSheet/)
    assert.match(savedScreen, /\{listsOpen && deleteConfirmOpen && \(\s*<BulkDeleteDialog/)
    assert.match(savedScreen, /\{listsOpen && selecting && \(\s*<BulkBar/)
  })
  it('place-detail-screen: リストの行は listsOpen の時だけ・保存のシートへ listsOpen を渡す', () => {
    assert.match(placeScreen, /\{listsOpen && placeLists\.length > 0 && \(/)
    assert.match(placeScreen, /<SaveSheet\s+lists=\{lists\}\s+listsOpen=\{listsOpen\}/)
  })
})

describe('T-A7 画面の門の目印(data-testid)が、リストの部品に付いている', () => {
  const read2 = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('札の列・リストのシート・保存のシートの行・「選ぶ」・店舗詳細の行', () => {
    assert.match(read2('../../../app/lists/list-chips.tsx'), /data-testid="list-chips"/)
    assert.match(read2('../../../app/lists/list-sheet.tsx'), /data-testid="list-sheet"/)
    assert.match(saveSheet, /data-testid="list-row"/)
    assert.match(savedScreen, /data-testid="list-select"/)
    assert.match(placeScreen, /data-testid="place-lists"/)
  })
})
