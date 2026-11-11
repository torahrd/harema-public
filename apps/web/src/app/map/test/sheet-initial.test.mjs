// 保存シートの出典の初期値と、検索 → シートの受け渡し・地図の口の配線。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  EMPTY_SOURCE_STATE,
  initialSheetFields,
  sourceOnCloseSearch,
  sourceOnCloseSheet,
  sourceOnLaunch,
  sourceOnOpenSheet,
} from '../sheet-initial.ts'

// コメント(`//` の行末と `/* */`)を除いてから語を探す。
const read = (rel) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const count = (text, needle) => text.split(needle).length - 1
const URL1 = 'https://tabelog.com/x'
const CREATE = { ok: true, mode: 'create' }
const EDIT = { ok: true, mode: 'edit', status: 'want_to_go', memo: 'm', sourceText: 'a', sourceTitle: 't' }

describe('initialSheetFields', () => {
  it('WST-I1 新規は出典に入る', () => {
    const r = initialSheetFields(CREATE, URL1, 'want_to_go')
    assert.equal(r.sourceText, URL1)
    assert.equal(r.fetchTitleFor, URL1)
    assert.equal(r.existingStatus, null)
  })
  it('WST-I2 編集は上書きしない', () => {
    const r = initialSheetFields(EDIT, 'b', 'want_to_go')
    assert.equal(r.sourceText, 'a')
    assert.equal(r.fetchTitleFor, null)
    assert.equal(r.existingStatus, 'want_to_go')
  })
  it('WST-I3 長さ(サロゲートを割らない)', () => {
    const r = initialSheetFields(CREATE, '😀'.repeat(1001), 'want_to_go')
    assert.equal([...r.sourceText].length, 1000)
    assert.equal(r.sourceText, '😀'.repeat(1000))
  })
  it('出典が無い・空白だけなら取りに行かない', () => {
    assert.equal(initialSheetFields(CREATE, null, 'want_to_go').fetchTitleFor, null)
    assert.equal(initialSheetFields(CREATE, '   ', 'want_to_go').fetchTitleFor, null)
  })
})

describe('出典の受け渡し', () => {
  it('WST-W5 候補を選ぶと出典がシートへ移る', () => {
    let s = sourceOnLaunch(EMPTY_SOURCE_STATE, URL1)
    s = sourceOnOpenSheet(s)
    assert.deepEqual(s, { launchSource: null, sheetSource: URL1 })
    s = sourceOnCloseSearch(s)
    assert.equal(s.sheetSource, URL1)
  })
  it('WST-W6 選ばずに閉じると捨てる', () => {
    let s = sourceOnLaunch(EMPTY_SOURCE_STATE, URL1)
    s = sourceOnCloseSearch(s)
    s = sourceOnOpenSheet(s)
    assert.equal(s.sheetSource, null)
  })
  it('WST-W7 シートを閉じると捨てる・別の店へ入らない', () => {
    let s = sourceOnLaunch(EMPTY_SOURCE_STATE, URL1)
    s = sourceOnCloseSheet(sourceOnOpenSheet(s))
    assert.equal(s.sheetSource, null)
    assert.equal(sourceOnOpenSheet(s).sheetSource, null)
  })
})

describe('配線(ソース照合)', () => {
  const map = read('../map-screen.tsx')
  const sheet = read('../save-sheet.tsx')
  const body = (src, head) => {
    const i = src.indexOf(head)
    assert.notEqual(i, -1, head)
    return src.slice(i)
  }

  it('WST-W1 地図は端末の中身を 1 回読む', () => {
    assert.equal(count(map, "import { takePendingShare } from '@/lib/share-pending'"), 1)
    assert.equal(count(map, 'takePendingShare('), 1)
  })
  it('WST-W2 検索を閉じると出典を捨てる', () => {
    const b = body(map, 'const closeSearch = useCallback(')
    assert.ok(b.slice(0, b.indexOf('}, [resetSession])')).includes('sourceOnCloseSearch'))
  })
  it('WST-W3 シートへ渡す', () => {
    assert.equal(count(map, 'initialSourceText={source.sheetSource}'), 1)
    assert.equal(count(map, 'launchSource}'), 0)
    assert.ok(sheet.includes('initialSheetFields('))
    const b = body(map, 'const handleSelectSuggestion = useCallback(')
    const food = b.slice(0, b.indexOf("void fetchPlaceFields(place, ['location', 'viewport'])"))
    const open = food.indexOf('sourceOnOpenSheet')
    assert.notEqual(open, -1)
    assert.ok(open < food.indexOf('closeSearch('))
    // POI・ピンの入口とシートを閉じる 2 つの道
    assert.ok(body(map, 'const openPlaceSheet = useCallback(').includes('sourceOnOpenSheet'))
    assert.ok(body(map, 'const closeSheet = useCallback(').includes('sourceOnCloseSheet'))
    assert.ok(body(map, 'const handleSaved = useCallback(').includes('sourceOnCloseSheet'))
  })
  it('WST-W8 シートは受けた出典で初期値を作り、新規ならタイトルを 1 回取りに行く', () => {
    assert.ok(sheet.includes('initialSheetFields(result, initialSourceText,'))
    assert.ok(sheet.includes('setSourceText(initial.sourceText)'))
    assert.ok(sheet.includes('maybeFetchTitleRef.current(initial.fetchTitleFor)'))
    assert.ok(sheet.includes('maybeFetchTitleRef.current = maybeFetchTitle'))
    assert.ok(sheet.includes('}, [context.googlePlaceId, initialSourceText, router])'))
  })
  it('WST-W4 保存の道は今のまま', () => {
    const m = sheet.match(/import \{([^}]*)\} from '\.\/save-actions'/)
    assert.ok(m)
    const names = m[1].split(',').map((x) => x.trim()).filter(Boolean).sort()
    assert.deepEqual(names, ['deleteSavedPlace', 'deleteSavedPlaceFromDetail', 'fetchSourceTitle', 'resolveSavedPlace', 'savePlace'])
    for (const f of [
      '../../../lib/share-pending.ts',
      '../../../lib/share-target.ts',
      '../sheet-initial.ts',
      '../../share/page.tsx',
      '../../share/share-receiver.tsx',
    ]) {
      const src = read(f)
      assert.equal(/lib\/places|fetchPlaceFields|getPlaceDetails|from '@vis\.gl/.test(src), false, f)
    }
  })
})
