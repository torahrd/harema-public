// T-W5 の配線(ソースの照合): 一覧の画面の絞り・行・地図・シートの下の地図の器。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const screen = read('../saved-list-screen.tsx')
const sheet = read('../../lists/list-sheet.tsx')
const layout = read('../list-map-layout.ts')
const cover = read('../../map/use-sheet-cover.ts')
const savedMap = read('../saved-list-map.tsx')

describe('一覧の画面のリストの絞り', () => {
  it('持っている id を resolveSelectedList に通してから使う', () => {
    assert.ok(screen.includes('resolveSelectedList(selectedListId, lists)'))
  })
  it('filterByList の結果を、行と地図(markersForTab の入り口)の両方に渡す', () => {
    assert.ok(screen.includes('filterByList(rows, activeListId)'))
    assert.ok(screen.includes('filteredRows.filter((row) => row.status === status)'))
    assert.match(screen, /<SavedListMap\s+rows=\{filteredRows\}/)
  })
  it('行の絵は pinIconFor の値(絞り通過後の行)', () => {
    assert.ok(screen.includes('icon={pinIconFor(row.listIds, lists, activeListId)}'))
  })
  it('札を替えると、選びを外し・一覧を先頭へ即時に戻す', () => {
    const fn = screen.slice(screen.indexOf('const selectList = useCallback'))
    const body = fn.slice(0, fn.indexOf('}, [])'))
    assert.ok(body.includes('setCheckedIds([])') && body.includes("behavior: 'instant'"))
  })
  it('list-map-layout.ts の定数を上書きしない(import だけ)', () => {
    assert.ok(!/(LIST_VISIBLE_ROWS|ROW_PADDING_Y|NAME_SLOT_HEIGHT)\s*=/.test(screen))
    assert.ok(layout.includes('export const LIST_VISIBLE_ROWS = 4'))
  })
})

describe('一覧でシートが開いている間の地図の器', () => {
  it('画面は useListSheetCover を呼び、フックは sheetCoverInset で計算する', () => {
    assert.ok(screen.includes('useListSheetCover(sheetOpen, mapBoxRef, mapOuterRef, sheetWrapperRef)'))
    assert.ok(sheet.includes("import { sheetCoverInset } from '../map/sheet-cover'"))
    assert.ok(sheet.includes('sheetCoverInset(sheetTop, outerRect.height)'))
  })
  it('閉じたら器の下端を 0 に戻す', () => {
    assert.ok(sheet.includes("mapBox.style.bottom = '0px'"))
  })
})

describe('一括の未ログインはログインへ送る', () => {
  it('applyBulk は unauthenticated で router.replace(/login) を呼び、失敗の知らせを出さずに戻る', () => {
    const start = screen.indexOf('const applyBulk = useCallback')
    const body = screen.slice(start, screen.indexOf('[showToast, endSelecting, router]', start))
    assert.match(body, /result\.reason === 'unauthenticated'\s*\)\s*\{\s*router\.replace\('\/login'\)\s*return/)
  })
})

describe('保存のシートの上のリストを選ぶシートにも地図の縮めを当てる', () => {
  it('useSheetCover は重なったシート全部のうち一番上の上端で測り、後から重なるシートを子の追加で追う', () => {
    assert.ok(cover.includes("wrapper.querySelectorAll<HTMLElement>(':scope > [role=\"dialog\"]')") || cover.includes(":scope > [role=\"dialog\"]"))
    assert.ok(cover.includes('Math.min(...dialogs().map('))
    assert.ok(cover.includes("childObserver.observe(wrapper, { childList: true })"))
  })
})

describe('一覧の地図の範囲合わせ(M1)', () => {
  it('依存は markers そのものでなく、ピンの id と座標の並びの鍵', () => {
    assert.ok(savedMap.includes('const markersKey = markers.map('))
    assert.ok(savedMap.includes('[map, markersKey, status]'))
    assert.ok(!/\[map, markers\]/.test(savedMap))
    assert.ok(savedMap.includes('cameraForMarkers(markersRef.current'))
  })
})

describe('リストのシートの器の縮み(題が欠けない)', () => {
  it('流れる領域の縮む率は 1000(題の帯より先に縮む・保存のシートと同じ)', () => {
    assert.ok(sheet.includes("flex: '1 1000 auto'"))
  })
})

// T5: 一括の操作の配線(単位 lists-bulk)。コメントを除いて読む。
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const code = stripComments(screen)
const bar = stripComments(read('../../lists/bulk-bar.tsx'))
/** `const <name> = useCallback(` から、その閉じ(`\n  )` または `\n  }, [`)まで。 */
function callback(name) {
  const start = code.indexOf(`const ${name} = useCallback(`)
  assert.ok(start >= 0, `${name} が無い`)
  const rest = code.slice(start)
  const end = rest.search(/\n {2}\)|\n {2}\}, \[/)
  return end < 0 ? rest : rest.slice(0, end)
}

describe('T5 一括の「外す」「入れる」', () => {
  it('「外す」の handler は applyBulk(remove, activeListId, …) を直接呼び、bulkSheet に remove を入れる所が無い', () => {
    assert.match(code, /onRemove=\{\(\) => \{\s*if \(activeListId !== null\) void applyBulk\('remove', activeListId, checkedIds\)/)
    assert.ok(!code.includes("setBulkSheet('remove')"))
    assert.ok(code.includes("useState<'add' | null>(null)"))
  })
  it('入れる段のリストは今のリストを除く(listsForBulkAdd)', () => {
    assert.ok(code.includes('lists={listsForBulkAdd(lists, activeListId)}'))
  })
  it('「新しいリスト」で作ったら、作ったリストに選んだ店を入れ(applyBulk add)、入れる段も閉じる', () => {
    const start = code.indexOf('<ListEditorSheet')
    const body = code.slice(start, code.indexOf('onClosed={() => setNewListOpen(false)}', start))
    assert.ok(body.includes("applyBulk('add', created.id, checkedIds)"))
    assert.ok(body.includes('setBulkSheet(null)'))
    assert.ok(code.includes('onNew={() => setNewListOpen(true)}'))
  })
})

describe('T5 一括の状態の変更・削除', () => {
  it('状態と削除の handler は unauthenticated で router.replace(/login)', () => {
    for (const name of ['changeStatus', 'deleteChecked']) {
      assert.match(
        callback(name),
        /result\.reason === 'unauthenticated'\s*\)\s*\{\s*router\.replace\('\/login'\)\s*return/,
      )
    }
  })
  it('削除の成功の枝に showToast が無い(成功は endSelecting して戻る)', () => {
    const body = callback('deleteChecked')
    const ok = body.slice(body.indexOf('if (result.ok) {'), body.indexOf('}', body.indexOf('if (result.ok) {')))
    assert.ok(ok.includes('endSelecting()'))
    assert.ok(!ok.includes('showToast'))
  })
  it("状態の成功の枝は showToast('save-updated') で選びを終える・from は今のタブの状態", () => {
    const body = callback('changeStatus')
    const ok = body.slice(body.indexOf('if (result.ok) {'), body.indexOf('}', body.indexOf('if (result.ok) {')))
    assert.ok(ok.includes("showToast('save-updated')") && ok.includes('endSelecting()'))
    assert.ok(body.includes('from: status, to'))
  })
  it('sheetOpen に状態を選ぶ段が入っている', () => {
    assert.match(code, /const sheetOpen = [^\n]*statusSheetOpen/)
  })
})

describe('T5 送信中(busy)は帯のボタンを押せない', () => {
  it('帯のボタンの disabled は busy を含む', () => {
    assert.match(bar, /const enabled = [^\n]*!busy/)
    assert.ok(bar.includes('disabled={!enabled}'))
  })
  it('applyBulk・状態・削除の handler は、送る前に busy を真にし、finally で偽に戻す', () => {
    for (const name of ['applyBulk', 'changeStatus', 'deleteChecked']) {
      const body = callback(name)
      const on = body.indexOf('setBusy(true)')
      const call = body.search(/await (changeListPlaces|bulkChangeStatus|bulkDeleteSavedPlaces)\(/)
      const fin = body.indexOf('finally')
      assert.ok(on >= 0 && call > on, `${name}: 送る前に setBusy(true)`)
      assert.ok(fin > call && body.indexOf('setBusy(false)', fin) > fin, `${name}: finally で setBusy(false)`)
    }
  })
  it('削除の確認の pending は busy', () => {
    assert.ok(code.includes('pending={busy}'))
  })
})

describe('T5 帯・状態を選ぶ段・削除の確認の描き出し', () => {
  it('BulkBar は bulkBarRows(activeListId) の段で描く', () => {
    assert.ok(code.includes('rows={bulkBarRows(activeListId)}'))
  })
  it('BulkDeleteDialog は選んだ件数と zBase 30 で描く', () => {
    assert.match(code, /<BulkDeleteDialog\s+zBase=\{30\}\s+count=\{checkedIds\.length\}/)
  })
})

// W9: 一括の状態の変更・削除の失敗の知らせ(既存の失敗の器に web.common.errorTryLater)
describe('T5(W9) 状態と削除の失敗の枝は bulk-error の知らせを出し、list-error を出さない', () => {
  for (const name of ['changeStatus', 'deleteChecked']) {
    it(name, () => {
      const body = callback(name)
      assert.ok(body.includes("showToast('bulk-error')"))
      assert.ok(!body.includes("'list-error'"))
    })
  }
  it('失敗では選びを残す(endSelecting は成功の枝だけ)・削除の確認は結果の後に閉じる', () => {
    for (const name of ['changeStatus', 'deleteChecked']) {
      const body = callback(name)
      assert.equal((body.match(/endSelecting\(\)/g) ?? []).length, 1, `${name}: endSelecting は成功の 1 か所だけ`)
    }
    const del = callback('deleteChecked')
    assert.ok(del.indexOf('setDeleteConfirmOpen(false)') > del.indexOf('finally'))
  })
  it('知らせの器: bulk-error は失敗の器(alert)で web.common.errorTryLater の 2 句を出す', () => {
    const toast = stripComments(read('../../map/map-toast.tsx'))
    assert.ok(toast.includes("variant === 'bulk-error'"))
    assert.ok(toast.includes("common.raw('errorTryLater')"))
    assert.ok(toast.includes("useTranslations('web.common')"))
  })
})

// lists-filter-carry T3: 絞りの引き継ぎ・タブの件数・「選ぶ」・札の列の配線(コメントを除いて読む)。
const chipsCode = stripComments(read('../../lists/list-chips.tsx'))

describe('lists-filter-carry 一覧の絞りの引き継ぎ', () => {
  it('lists-filter-carry 一覧は URL の list を parseListParam に通して初期値にし、resolveSelectedList を通す', () => {
    assert.ok(code.includes('parseListParam(searchParams.get(LIST_PARAM))'))
    assert.ok(code.includes('resolveSelectedList(selectedListId, lists)'))
  })
  it('lists-filter-carry 一覧は解決済みの絞りを URL に写し、タブを替えても list を落とさない', () => {
    const effectAt = code.indexOf('searchWithList(window.location.search, activeListId)')
    assert.ok(effectAt >= 0)
    const before = code.slice(0, effectAt)
    assert.ok(before.lastIndexOf('window.setTimeout(') > before.lastIndexOf('useEffect('))
    const after = code.slice(effectAt, effectAt + 400)
    assert.ok(after.includes('window.history.replaceState('))
    assert.ok(after.includes('window.clearTimeout('))
    const fn = code.slice(code.indexOf('const selectStatus = useCallback'))
    const body = fn.slice(0, fn.indexOf('[activeListId]'))
    assert.ok(body.includes('searchWithList(`?status=${next}`, activeListId)'))
    assert.ok(!body.includes("replaceState(null, '', `?status=${next}`)"))
  })
  it('lists-filter-carry 一覧の戻るは解決済みの絞りを付ける', () => {
    assert.ok(code.includes("href={pathWithList('/map', activeListId)}"))
    assert.ok(!code.includes('href="/map"'))
  })
  it('lists-filter-carry タブの札は countsForTabs の値', () => {
    assert.ok(code.includes('countsForTabs(counts, rows, activeListId)'))
    assert.ok(!code.includes('{counts[tabStatus]}'))
  })
  it('lists-filter-carry 「選ぶ」は selectEntryEnabled が偽の間 disabled で、帯のボタンと同じ見た目', () => {
    assert.ok(code.includes('selectEntryEnabled(visibleRows.length, selecting)'))
    assert.ok(code.includes('disabled={!canSelect}'))
    assert.ok(code.includes("opacity: 0.5, cursor: 'default'"))
  })
})

describe('lists-filter-carry 札の列', () => {
  it('lists-filter-carry 札の列は付いた時だけ選ばれた札を見える所へ動かす', () => {
    assert.ok(chipsCode.includes('[aria-pressed="true"]'))
    assert.match(chipsCode, /useEffect\(\(\) => \{[\s\S]*?\}, \[\]\)/)
    assert.ok(!chipsCode.includes('scrollIntoView'))
  })
})

describe('lists-filter-carry 101 件目の知らせ', () => {
  it('lists-filter-carry 上限で行を押した時は、選びを変えず bulk-limit の知らせを出す', () => {
    const at = code.indexOf('onToggle={() => {')
    const body = code.slice(at, at + 400)
    assert.ok(body.includes('selectionLimitHit(checkedIds, row.id)'))
    const limit = body.indexOf("showToast('bulk-limit')")
    const set = body.indexOf('setCheckedIds(')
    assert.ok(limit >= 0 && set > limit)
    assert.ok(body.slice(limit, set).includes('return'))
  })
  it('lists-filter-carry 知らせの器は失敗の器で、web.lists.bulkLimit に LIST_BULK_MAX を入れ、ja と en に鍵がある', () => {
    const toast = stripComments(read('../../map/map-toast.tsx'))
    assert.ok(toast.includes("variant === 'bulk-limit'"))
    assert.ok(toast.includes("lists('bulkLimit', { count: LIST_BULK_MAX })"))
    const ja = read('../../../../../../packages/shared/i18n/ja.ts')
    const en = read('../../../../../../packages/shared/i18n/en.ts')
    assert.ok(ja.includes("bulkLimit: '一度に選べるのは {count} 件までです。'"))
    assert.ok(en.includes("bulkLimit: 'You can select up to {count} places at a time.'"))
  })
})


// 選ぶ段の題の行を出さない(所有者の決定 2026-11-26 22:40 JST・harema#152 のコメント 7193679845)。
describe('選ぶ段(リストを選ぶ・状態を選ぶ)は題の行を描かない', () => {
  const statusSheet = read('../../lists/status-pick-sheet.tsx')
  const editor = read('../../lists/list-editor-sheet.tsx')
  it('SheetFrame は hideTitle の時に h2 を描かず、題の文を aria-label にする', () => {
    assert.ok(sheet.includes('{!hideTitle && ('))
    assert.ok(sheet.includes('aria-label={hideTitle ? title : undefined}'))
    assert.ok(sheet.includes('aria-labelledby={hideTitle ? undefined : titleId}'))
  })
  it('ListSheet(保存のシートのリストを選ぶ・一括の入れるリスト)は hideTitle を渡す', () => {
    const body = sheet.slice(sheet.indexOf('export function ListSheet'))
    assert.match(body, /<SheetFrame\s+zBase=\{zBase\}\s+title=\{title\}\s+hideTitle\s/)
  })
  it('状態を選ぶ段は hideTitle を渡す', () => {
    assert.ok(statusSheet.includes("title={t('statusPickTitle')} hideTitle"))
  })
  it('名前とアイコンのシートは題を残す(対象の外)', () => {
    assert.ok(!editor.includes('hideTitle'))
  })
})
