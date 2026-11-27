// T-W9: 配線(ソースの照合)。核の順序・Server Action の取り直し・deps の user_id の条件。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/** コメントを除く(コメントに書いた語で照合が動かないように)。 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (p) => stripComments(readFileSync(new URL(p, import.meta.url), 'utf8'))
const core = read('../list-core.ts')
const actions = read('../../../app/lists/list-actions.ts')
const deps = read('../list-deps.ts')
const saveActions = read('../../../app/map/save-actions.ts')
const saveSheet = read('../../../app/map/save-sheet.tsx')
const mapScreen = read('../../../app/map/map-screen.tsx')

/** `export async function <name>(` から次の `export ` まで(最後は終わりまで)。 */
function block(source, name) {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `${name} が無い`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next < 0 ? undefined : next)
}

describe('T-W9(a) 核は Zod → getUser → listsOpen → openDb の順で呼ぶ', () => {
  for (const name of ['runCreateList', 'runUpdateList', 'runDeleteList', 'runChangeListPlaces', 'runSetPlaceLists']) {
    it(name, () => {
      const body = block(core, name)
      const parse = body.indexOf('.safeParse(')
      const user = body.indexOf('env.getUser()')
      const gate = body.indexOf('env.listsOpen()')
      const open = body.indexOf('env.openDb()')
      assert.ok(parse >= 0 && user >= 0 && gate >= 0 && open >= 0)
      assert.ok(parse < user && user < gate && gate < open, '順序が Zod → getUser → listsOpen → openDb でない')
      assert.ok(body.includes("reason: 'unauthenticated'"))
    })
  }
  it('核は DB・cookie・admin を import しない(値の import は shared の Zod だけ)', () => {
    const imports = [...core.matchAll(/(?:^|\n)import\s[\s\S]*?\sfrom\s+'([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(imports, ['@harema/shared/validations'])
  })
})

describe('T-W9(b) Server Action', () => {
  const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1])
  it('export は 5 つ', () => {
    assert.deepEqual(exported.sort(), ['changeListPlaces', 'createList', 'deleteList', 'setPlaceLists', 'updateList'])
  })
  const cores = {
    createList: 'runCreateList',
    updateList: 'runUpdateList',
    deleteList: 'runDeleteList',
    changeListPlaces: 'runChangeListPlaces',
    setPlaceLists: 'runSetPlaceLists',
  }
  for (const [name, run] of Object.entries(cores)) {
    it(`${name} は核 ${run} を呼ぶ`, () => {
      assert.ok(block(actions, name).includes(`${run}(input, env())`))
    })
  }
  for (const name of ['createList', 'updateList', 'deleteList', 'changeListPlaces']) {
    it(`${name} は成功の枝でだけ取り直す`, () => {
      const body = block(actions, name)
      assert.match(body, /if \(result\.ok\) revalidateListPages\(\)/)
      assert.equal(body.split('revalidateListPages').length - 1, 1)
    })
  }
  it('setPlaceLists には取り直しが無い(保存の流れの router.refresh 1 回に任せる)', () => {
    const body = block(actions, 'setPlaceLists')
    assert.ok(!body.includes('revalidate'))
  })
  it('revalidatePath は revalidateListPages の中だけ(/map・/saved・/lists)', () => {
    assert.equal(actions.split('revalidatePath(').length - 1, 3)
    assert.ok(
      actions.includes("revalidatePath('/map')") &&
        actions.includes("revalidatePath('/saved')") &&
        actions.includes("revalidatePath('/lists')"),
    )
    const body = actions.slice(actions.indexOf('function revalidateListPages'))
    assert.ok(body.slice(0, body.indexOf('\n}')).includes("revalidatePath('/lists')"))
  })
  it('admin client を import しない・router.refresh に当たる物が無い', () => {
    assert.ok(!actions.includes('supabase/admin'))
    const dir = new URL('../../../app/lists/', import.meta.url)
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const src = stripComments(readFileSync(new URL(f, dir), 'utf8'))
      assert.ok(!/router\.refresh|\.refresh\(\)/.test(src), `${f} が refresh を呼んでいる`)
      assert.ok(!src.includes('supabase/admin'), `${f} が admin を import している`)
    }
  })
  it('getVerifiedUser と createUserSupabase を使う(要求ごとの client・module scope に置かない)', () => {
    assert.ok(actions.includes('getUser: getVerifiedUser'))
    assert.ok(actions.includes('listsOpen: async () => (await readAgreementState(await createUserSupabase())).listsOpen'))
    assert.ok(actions.includes('createListDeps(await createUserSupabase())'))
  })
})

describe('T-W9(c) deps は user_id の条件を持つ', () => {
  const chunk = (from, to) => {
    const a = deps.indexOf(from)
    const b = deps.indexOf(to, a + 1)
    assert.ok(a >= 0 && b > a)
    return deps.slice(a, b)
  }
  it('insert の行に user_id: userId', () => {
    assert.ok(chunk('insertList:', 'updateList:').includes('user_id: userId'))
  })
  it('update の鎖に .eq(user_id, userId)', () => {
    assert.ok(chunk('updateList:', 'deleteList:').includes(".eq('user_id', userId)"))
  })
  it('delete の鎖に .eq(user_id, userId)', () => {
    assert.ok(chunk('deleteList:', 'readOwnListIds:').includes(".eq('user_id', userId)"))
  })
  it('保存の店を引く鎖に .eq(user_id, userId)', () => {
    assert.ok(chunk('findSavedPlace:', 'addListPlaces:').includes(".eq('user_id', userId)"))
  })
  it('add は ignoreDuplicates の upsert・lists へは upsert を使わない', () => {
    assert.ok(chunk('addListPlaces:', 'removeListPlaces:').includes('ignoreDuplicates: true'))
    assert.ok(!chunk('insertList:', 'addListPlaces:').includes('.upsert('))
  })
})

describe('T-W9(d) savePlace・performDelete は変えていない(リストに触れない)', () => {
  it('savePlace・performDelete の塊にリストの語が無い', () => {
    const save = saveActions.slice(saveActions.indexOf('export async function savePlace('))
    assert.ok(!/list/i.test(save), 'savePlace 以降にリストの語')
  })
})

describe('T-W9(e) 保存のシートからのリストの入れ替えの配線', () => {
  const handleSave = saveSheet.slice(saveSheet.indexOf('const handleSave = async'))
  const body = handleSave.slice(0, handleSave.indexOf('finally'))
  it('savePlace の後に、選びが開いた時と違う時だけ setPlaceLists を呼ぶ', () => {
    const save = body.indexOf('savePlace(input)')
    const set = body.indexOf('setPlaceLists({ googlePlaceId: context.googlePlaceId, listIds })')
    assert.ok(save >= 0 && set >= 0 && save < set, 'savePlace より前に setPlaceLists がある、または無い')
    assert.ok(body.includes('!sameIds(listIds, initialListIds)'))
  })
  it('編集で解決した所属を初期値と選びの両方に入れる', () => {
    assert.ok(saveSheet.includes('setInitialListIds(result.listIds)'))
    assert.ok(saveSheet.includes('setListIds(result.listIds)'))
  })
  it('競合の開き直しでも所属を取り込み、所属が読めるまでリストの行を押せない', () => {
    assert.ok(body.includes('setInitialListIds(again.listIds)'))
    assert.ok(body.includes('setListIds((current) => [...new Set([...again.listIds, ...current])])'))
    assert.ok(saveSheet.includes('disabled={busy || !listsKnown}'))
  })
  it('地図の handleSaved が selectionAfterSave と listError を使う', () => {
    const at = mapScreen.indexOf('const handleSaved = useCallback')
    const fn = mapScreen.slice(at, at + 3500)
    assert.ok(fn.includes('selectionAfterSave(activeListIdRef.current, listOutcome.listIds)'))
    assert.ok(fn.includes('listOutcome.listError'))
  })
})

// lists-filter-carry T3: 地図・保存のシート・メニューの配線(コメントを除いて読む)。
describe('lists-filter-carry 地図の絞りの引き継ぎ', () => {
  const drawer = read('../../../app/account/drawer.tsx')
  const card = read('../../../app/map/map-notice-card.tsx')
  const banner = read('../../../app/map/location-permission-banner.tsx')
  const placeDetail = read('../../../app/places/[id]/place-detail-screen.tsx')
  it('lists-filter-carry 地図は URL の list を初期値にして URL に写し、メニューの行き先に解決済みの絞りを付ける', () => {
    assert.ok(mapScreen.includes('parseListParam(searchParams.get(LIST_PARAM))'))
    const at = mapScreen.indexOf('searchWithList(window.location.search, activeListId)')
    assert.ok(at >= 0)
    const before = mapScreen.slice(0, at)
    assert.ok(before.lastIndexOf('window.setTimeout(') > before.lastIndexOf('useEffect('))
    const after = mapScreen.slice(at, at + 400)
    assert.ok(after.includes('window.history.replaceState(') && after.includes('window.clearTimeout('))
    assert.ok(mapScreen.includes("savedHref={pathWithList('/saved', activeListId)}"))
    assert.ok(drawer.includes('router.push(savedHref)'))
    assert.ok(!drawer.includes("router.push('/saved')"))
  })
  it('lists-filter-carry 地図は保存のシートに解決済みの絞りを渡す(店舗詳細の編集は渡さない)', () => {
    assert.ok(mapScreen.includes('defaultListId={activeListId}'))
    assert.ok(!mapScreen.includes('defaultListId={selectedListId}'))
    assert.ok(!placeDetail.includes('defaultListId'))
  })
  it('lists-filter-carry 保存のシートは新規の枝でだけ初期の選びを入れ、開いた時の所属には入れない', () => {
    assert.equal(saveSheet.split('listChoiceForNewPlace(').length - 1, 1)
    assert.ok(saveSheet.includes("if (result.mode !== 'edit') setListIds(listChoiceForNewPlace(defaultListIdRef.current))"))
    assert.ok(!/setInitialListIds\([^)]*(listChoiceForNewPlace|defaultListId)/.test(saveSheet))
    assert.ok(saveSheet.includes('[context.googlePlaceId, initialSourceText, router]'))
  })
  it('lists-filter-carry 店の無いリストの知らせは、位置情報の帯と同じ器・一覧と同じ辞書の鍵で、条件が揃った時だけ出る', () => {
    assert.ok(mapScreen.includes("useTranslations('web.lists')"))
    assert.ok(mapScreen.includes("listsText('empty')"))
    assert.ok(mapScreen.includes('emptyListNoteVisible(activeListId, savedPlaces.length, emptyNoteDismissedFor)'))
    const cond = mapScreen.slice(mapScreen.indexOf('const showEmptyListNote ='))
    const head = cond.slice(0, cond.indexOf('\n\n'))
    for (const needle of ['listsOpen', '!isSearchActive', '!chromeDisabled']) assert.ok(head.includes(needle), needle)
    assert.ok(mapScreen.includes('<MapNoticeCard onDismiss={() => setEmptyNoteDismissedFor(activeListId)}>'))
    assert.ok(banner.includes('<MapNoticeCard onDismiss={onDismiss}>'))
    assert.ok(card.includes("zIndex: 11") && card.includes("boxShadow: 'var(--shadow-2)'"))
  })
  it('lists-filter-carry 保存の後は、URL の list を同期で書いてから router.refresh() を投げる', () => {
    const at = mapScreen.indexOf('const handleSaved = useCallback')
    const fn = mapScreen.slice(at, mapScreen.indexOf('[router, showToast]', at))
    assert.ok(fn.includes('selectionAfterSave(activeListIdRef.current, listOutcome.listIds)'))
    const write = fn.indexOf('window.history.replaceState(')
    const refresh = fn.indexOf('router.refresh()')
    assert.ok(write >= 0 && refresh >= 0 && write < refresh, 'replaceState が router.refresh() より後、または無い')
    assert.ok(!fn.includes('setSelectedListId((current)'))
    assert.ok(/useEffect\(\(\) => \{\s*activeListIdRef\.current = activeListId\s*\}, \[activeListId\]\)/.test(mapScreen))
  })
  it('lists-filter-carry 保存の後は知らせに閉じた印を付けない(× を押していないのに知らせが出なくなるのを防ぐ)', () => {
    const at = mapScreen.indexOf('const handleSaved = useCallback')
    const fn = mapScreen.slice(at, mapScreen.indexOf('[router, showToast]', at))
    assert.ok(!fn.includes('setEmptyNoteDismissedFor('))
  })
  it('lists-filter-carry 札を押した時は、今の絞りと違う時だけ閉じた印を消す', () => {
    const at = mapScreen.indexOf('onSelect={(next) => {')
    const body = mapScreen.slice(at, at + 300)
    assert.ok(body.includes('if (next !== activeListId) setEmptyNoteDismissedFor(null)'))
    assert.ok(!/\n\s*setEmptyNoteDismissedFor\(null\)/.test(body))
  })
  it('lists-filter-carry bannerSlot は常に Fragment で、位置情報の帯が 1 つ目・知らせが下', () => {
    const slot = mapScreen.slice(mapScreen.indexOf('bannerSlot={')).replace(/\s+/g, '')
    assert.ok(slot.startsWith('bannerSlot={showBanner||showEmptyListNote?(<>'))
    const bannerAt = slot.indexOf('<LocationPermissionBanner')
    const noteAt = slot.indexOf('<MapNoticeCardonDismiss={()=>setEmptyNoteDismissedFor(activeListId)}>')
    assert.ok(bannerAt > 0 && noteAt > bannerAt, '帯が知らせより後、または無い')
  })
})
