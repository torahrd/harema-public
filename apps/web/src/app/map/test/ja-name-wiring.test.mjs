// JN-9a・JN-9b・JN-9d・T4: 英語の画面の日本語の店名(押せる札)の配線(ソースの照合)。harema#219
// 実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const SRC = fileURLToPath(new URL('../../../', import.meta.url))
const read = (path) => readFileSync(join(SRC, path), 'utf8')

/** `apps/web/src` の test を除く全部の `.ts`・`.tsx`。 */
function productionSources(dir = SRC, found = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'test' || name === 'node_modules') continue
      productionSources(full, found)
    } else if (/\.(ts|tsx)$/.test(name)) {
      found.push(relative(SRC, full).split(sep).join('/'))
    }
  }
  return found
}

/** `source` の `open` の位置の `(`・`{` から対応する閉じ括弧までの中身。 */
function balanced(source, open) {
  const pair = source[open] === '(' ? ')' : '}'
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === source[open]) depth += 1
    else if (source[i] === pair) {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error('対応する括弧が無い')
}

const MESSAGES = { en: read('../../../packages/shared/i18n/en.ts'), ja: read('../../../packages/shared/i18n/ja.ts') }

describe('JN-9a 取得の口と配線', () => {
  const files = productionSources()

  it('requestedLanguage と fetchFields( は details-cache.ts にしか無い(apps/web/src の test を除く全部)', () => {
    assert.ok(files.length > 50, '走査の範囲が空でない')
    for (const needle of ['requestedLanguage', 'fetchFields(']) {
      const hits = files.filter((file) => read(file).includes(needle))
      assert.deepEqual(hits, ['lib/places/details-cache.ts'], needle)
    }
  })

  it('getJapaneseDisplayName( の呼び出しは use-japanese-name.ts の reveal の中の 1 か所だけで、useEffect( の中に無い', () => {
    const hits = files.filter((file) => file !== 'lib/places/details-cache.ts' && read(file).includes('getJapaneseDisplayName('))
    assert.deepEqual(hits, ['app/map/use-japanese-name.ts'])
    const src = read('app/map/use-japanese-name.ts')
    assert.equal([...src.matchAll(/getJapaneseDisplayName\(/g)].length, 1)
    // reveal の中(useCallback の本体)
    const revealAt = src.indexOf('const reveal = useCallback(')
    assert.ok(revealAt >= 0)
    const reveal = balanced(src, src.indexOf('(', revealAt + 'const reveal = useCallback'.length - 1))
    assert.ok(reveal.includes('getJapaneseDisplayName('), 'reveal の中で呼ぶ')
    // useEffect の本体の中には無い(開いた時に取らない)
    for (const effect of src.matchAll(/useEffect\(/g)) {
      const body = balanced(src, effect.index + 'useEffect'.length)
      assert.ok(!body.includes('getJapaneseDisplayName'), 'useEffect の中で取らない')
      assert.ok(!body.includes('resolveJapaneseName'), 'useEffect の中で取らない')
      assert.ok(!body.includes('reveal'), 'useEffect の中で押さない')
    }
  })

  it('use-japanese-name.ts に渡る locale は useLocale() の値で、en・ja の直書きが無い', () => {
    const src = read('app/map/use-japanese-name.ts')
    assert.match(src, /const locale = useLocale\(\)/)
    assert.match(src, /shouldOfferJapaneseName\(\{ locale,/)
    assert.match(src, /resolveJapaneseName\(\{ locale,/)
    assert.doesNotMatch(src, /locale\s*[:=]\s*['"](en|ja)['"]/)
    assert.doesNotMatch(src, /['"]en['"]/)
  })

  it('hook は返す状態を japaneseNameStateFor(eligible, snapshot, placeId) で決め、自前の分岐を持たない', () => {
    const src = read('app/map/use-japanese-name.ts')
    assert.match(src, /japaneseNameStateFor\(eligible, snapshot, placeId\)/)
    assert.doesNotMatch(src, /snapshot\.placeId !== placeId/)
  })

  it('一覧・検索の候補・削除の確認は日本語の店名・札・国を参照しない', () => {
    for (const file of ['app/saved/saved-list-screen.tsx', 'app/map/delete-confirm-dialog.tsx', 'app/map/search-suggestions.tsx']) {
      assert.doesNotMatch(read(file), /japaneseName|JapaneseName|ja-name|countryCode/, file)
    }
  })

  it('「Google マップで開く」の引数は display.displayName のまま(日本語の店名を使わない)', () => {
    const src = read('app/places/[id]/place-detail-screen.tsx')
    const calls = [...src.matchAll(/googleMapsHref\(/g)]
    assert.ok(calls.length >= 1)
    for (const call of calls) {
      const args = balanced(src, call.index + call[0].length - 1)
      assert.match(args, /^display\.displayName,/)
      assert.doesNotMatch(args, /japanese/i)
    }
  })

  it('地図の 2 か所の setSheetContext に countryCodeOf(place.addressComponents) が入り、hook へ渡る。保存のシートに hook の値が渡る', () => {
    const src = read('app/map/map-screen.tsx')
    assert.equal([...src.matchAll(/countryCode: countryCodeOf\(place\.addressComponents\),/g)].length, 2)
    assert.equal([...src.matchAll(/displayNameLanguageCode: place\.displayNameLanguageCode \?\? null/g)].length, 2)
    assert.match(src, /useJapaneseName\(\s*places,/)
    assert.match(src, /displayNameLanguageCode: sheetContext\.displayNameLanguageCode,/)
    assert.match(src, /countryCode: sheetContext\.countryCode,/)
    assert.match(src, /japaneseName=\{japaneseName\}/)
  })

  it('店舗詳細の state に countryCodeOf(place.addressComponents) が入り、hook に渡る', () => {
    const src = read('app/places/[id]/place-detail-screen.tsx')
    assert.match(src, /setCountryCode\(countryCodeOf\(place\.addressComponents\)\)/)
    const at = src.indexOf('useJapaneseName(\n')
    const args = balanced(src, src.indexOf('(', at))
    assert.match(args, /countryCode,/)
  })

  it('保存のシートは取得をしない(hook も口も呼ばない)', () => {
    const src = read('app/map/save-sheet.tsx')
    assert.doesNotMatch(src, /useJapaneseName\(|getJapaneseDisplayName|resolveJapaneseName|details-cache/)
  })
})

describe('JN-9b 札と行の値', () => {
  const slot = read('app/map/japanese-name-slot.tsx')

  it('焦点は札を押した時だけ移す: effect は pressed が立っていなければ何もせず、pressed は札の onClick でだけ立つ。開いた時(autoFocus・マウント時の focus())には動かさない', () => {
    // コメントを除いた本体で照らす(注釈の語で通らないように)
    const code = slot.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    const effectAt = code.indexOf('useEffect(')
    assert.ok(effectAt >= 0, 'useEffect が在る')
    const effect = balanced(code, effectAt + 'useEffect'.length)
    assert.match(effect, /^\s*\(\) => \{\s*if \(!pressed\.current\) return/, '押していなければ何もしない(先頭で抜ける)')
    assert.match(effect, /state\.phase === 'chip'\) \{\s*if \(state\.error\) chipRef\.current\?\.focus\(\)/, '失敗で札に戻る時だけ札へ戻す(読み込み中に店が替わった時は動かさない)')
    assert.match(effect, /state\.phase !== 'hidden'\) resultRef\.current\?\.focus\(\)/, '結果の行へ移す')
    // focus() はこの effect の中の、pressed の確認より後にしか無い
    assert.equal([...code.matchAll(/\.focus\(/g)].length, 2)
    assert.ok(effect.indexOf('if (!pressed.current) return') < effect.indexOf('.focus('))
    // pressed を立てるのは札の onClick だけ
    assert.equal([...code.matchAll(/pressed\.current = true/g)].length, 1)
    const clickAt = code.indexOf('onClick={')
    assert.ok(clickAt >= 0)
    assert.match(balanced(code, clickAt + 'onClick='.length), /pressed\.current = true[\s\S]*onReveal\(\)/)
    assert.doesNotMatch(code, /autoFocus/)
    // 札と結果の行に ref・結果の行は tabIndex={-1}
    assert.match(code, /ref=\{chipRef\}/)
    assert.match(code, /ref=\{resultRef\}\s+tabIndex=\{-1\}/)
  })

  it('札の値は lists/list-chips.tsx の chipStyle の選んでいない時の値と同じ字', () => {
    const chips = read('app/lists/list-chips.tsx')
    const chipFn = chips.slice(chips.indexOf('function chipStyle'), chips.indexOf('export function ListChips'))
    // list-chips 側(選んでいない時の側の値)
    assert.match(chipFn, /\.\.\.META,/)
    assert.match(chipFn, /border: `1px solid \$\{selected \? 'var\(--fg-1\)' : 'var\(--border\)'\}`/)
    assert.match(chipFn, /borderRadius: 'var\(--radius-chip\)'/)
    assert.match(chipFn, /padding: '5px 12px'/)
    assert.match(chipFn, /background: selected \? 'var\(--fg-1\)' : 'var\(--surface\)'/)
    assert.match(chipFn, /color: selected \? 'var\(--bg\)' : 'var\(--fg-1\)'/)
    assert.match(chipFn, /whiteSpace: 'nowrap'/)
    assert.match(chipFn, /cursor: 'pointer'/)
    // 札の側が同じ値
    const chip = slot.slice(slot.indexOf('const CHIP_STYLE'), slot.indexOf('export function JapaneseNameSlot'))
    assert.match(chip, /\.\.\.META,/)
    assert.match(chip, /whiteSpace: 'nowrap'/)
    assert.match(chip, /cursor: 'pointer'/)
    assert.match(chip, /border: '1px solid var\(--border\)'/)
    assert.match(chip, /borderRadius: 'var\(--radius-chip\)'/)
    assert.match(chip, /padding: '5px 12px'/)
    assert.match(chip, /background: 'var\(--surface\)'/)
    assert.match(chip, /color: 'var\(--fg-1\)'/)
    assert.doesNotMatch(chip, /boxShadow/, '影は無し')
  })

  it('札の字は辞書の show・結果の文は same・none・failed(直書きでない)', () => {
    assert.match(slot, /useTranslations\('web\.japaneseName'\)/)
    assert.match(slot, /\{t\('show'\)\}/)
    assert.match(slot, /t\('same'\)/)
    assert.match(slot, /t\('none'\)/)
    assert.match(slot, /\{t\('failed'\)\}/)
    const code = slot.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(code, /Show name in Japanese|No Japanese name|Same as the name above|Couldn/)
  })

  it('名前・same・none の行は同じ様式(...META・var(--fg-2))で、読み上げは aria-live="polite"', () => {
    const at = slot.indexOf('// loading・name・same・none は同じ要素で描く')
    assert.ok(at >= 0)
    const row = slot.slice(at)
    assert.match(row, /aria-live="polite"/)
    assert.match(row, /\.\.\.META,\s*color: 'var\(--fg-2\)',/)
    assert.match(row, /state\.phase === 'name' \? state\.text/)
  })

  it('届くまでの行は高さ 20・棒は saved-skeleton-bar・幅 44%・高さ 9', () => {
    assert.match(slot, /height: 20, display: 'flex', alignItems: 'center'/)
    assert.match(slot, /className="saved-skeleton-bar" style=\{\{ width: '44%', height: 9 \}\}/)
    // 住所の行の棒(店舗詳細の今の値)と同じ
    const detail = read('app/places/[id]/place-detail-screen.tsx')
    assert.match(detail, /className="saved-skeleton-bar" style=\{\{ width: '44%', height: 9 \}\}/)
  })

  it('赤い字の行は ...META・var(--akane-text)・role="alert"・文は辞書の failed。上の間は marginTop(名前の行と同じ値)で、札の後ろに描く(札を消さない)', () => {
    const alert = slot.slice(slot.indexOf('{state.error && ('), slot.indexOf('</p>'))
    assert.match(alert, /role="alert"/)
    assert.match(alert, /\.\.\.META,\s*color: 'var\(--akane-text\)'/)
    assert.match(alert, /marginTop,/)
    assert.match(alert, /t\('failed'\)/)
    // 札(button)が先に在り、赤い字がその後ろ(同じ fragment の中)。error の時も札を描く
    const chipBranch = slot.slice(slot.indexOf("if (state.phase === 'chip')"), slot.indexOf('// loading・name・same・none'))
    assert.ok(chipBranch.indexOf('<button') >= 0 && chipBranch.indexOf('<button') < chipBranch.indexOf('role="alert"'))
    // 保存の失敗(保存のシート)と同じ値
    const sheet = read('app/map/save-sheet.tsx')
    const saveError = sheet.slice(sheet.indexOf('{saveError && ('), sheet.indexOf('{common(\'actionError\')}'))
    assert.match(saveError, /role="alert"/)
    assert.match(saveError, /\.\.\.META,\s*color: 'var\(--akane-text\)'/)
  })

  it('marginBottom は一番下の要素に付く(赤い字が出ている時は赤い字の行・札の下には付けない)', () => {
    assert.match(slot, /\.\.\.\(state\.error \? null : \{ marginBottom \}\)/)
    assert.match(slot, /marginBottom: marginBottom \?\? 0/)
  })

  it('シートの上の間は 4・店舗詳細は 5。シートは keyboardOpen の間は部品を描かない・下の間の式は今のまま', () => {
    const sheet = read('app/map/save-sheet.tsx')
    const at = sheet.indexOf('{showJapaneseName && (')
    assert.ok(at >= 0)
    const block = balanced(sheet, sheet.indexOf('(', at + '{showJapaneseName && '.length - 1))
    assert.match(block, /<JapaneseNameSlot/)
    assert.match(block, /marginTop=\{4\}/)
    assert.match(block, /marginBottom=\{showAddress \? 0 : mode === 'create' \? 18 : 14\}/)
    assert.match(block, /onReveal=\{japaneseName\.reveal\}/)
    assert.match(sheet, /const showJapaneseName = !keyboardOpen && japaneseName !== undefined && japaneseName\.phase !== 'hidden'/)
    // 住所の行は今のまま
    assert.match(sheet, /margin: mode === 'create' \? '4px 0 18px' : '4px 0 14px'/)
    assert.match(sheet, /\.\.\.\(showJapaneseName \|\| showAddress \? null : \{ marginBottom: 14 \}\)/)
    const detail = read('app/places/[id]/place-detail-screen.tsx')
    assert.match(detail, /<JapaneseNameSlot state=\{japaneseName\} onReveal=\{japaneseName\.reveal\} marginTop=\{5\} \/>/)
  })

  it('店舗詳細の順は 店名 → 札 → 住所で、住所の行は今のまま(...META・var(--fg-2)・marginTop: 5)', () => {
    const detail = read('app/places/[id]/place-detail-screen.tsx')
    const nameAt = detail.indexOf('{display.displayName}')
    const slotAt = detail.indexOf('<JapaneseNameSlot')
    const addressAt = detail.indexOf('{display.formattedAddress}')
    assert.ok(nameAt >= 0 && nameAt < slotAt && slotAt < addressAt)
    const addressStyle = detail.slice(detail.lastIndexOf('<div', addressAt), addressAt)
    assert.match(addressStyle, /\.\.\.META,\s*color: 'var\(--fg-2\)',\s*marginTop: 5,/)
  })
})

describe('JN-9d 店舗詳細と Edit', () => {
  const detail = read('app/places/[id]/place-detail-screen.tsx')

  it('hook に Places ライブラリと、1 回目の店名・言語・国を渡す(店名が取れるまでは null)', () => {
    assert.match(detail, /import \{ useJapaneseName \} from '@\/app\/map\/use-japanese-name'/)
    const at = detail.indexOf('useJapaneseName(\n')
    assert.ok(at >= 0, 'hook を呼んでいる')
    const args = balanced(detail, detail.indexOf('(', at))
    assert.match(args, /^\s*places,/)
    assert.match(args, /display === undefined\s*\?\s*null/)
    assert.match(args, /googlePlaceId: data\.googlePlaceId/)
    assert.match(args, /displayName: display\.displayName/)
    assert.match(args, /displayNameLanguageCode,/)
  })

  it('1 回目の店名の言語は Place の displayNameLanguageCode から持つ(返らない時は null)', () => {
    assert.match(detail, /setDisplayNameLanguageCode\(place\.displayNameLanguageCode \?\? null\)/)
  })

  it('詳細の編集の SaveSheet に、詳細の hook の状態と reveal がそのまま渡る(シートの中では取らない)', () => {
    const at = detail.indexOf('<SaveSheet\n')
    assert.ok(at >= 0)
    const block = detail.slice(at, detail.indexOf('/>', at))
    assert.match(block, /japaneseName=\{japaneseName\}/)
  })

  it('詳細の 1 回目の配列と一覧の配列が共に addressComponents を含む(一覧から詳細を開いて取り直さない)', () => {
    const arrayOf = (src, name) => {
      const at = src.indexOf(`${name}(`)
      assert.ok(at >= 0, name)
      return [...balanced(src, at + name.length).matchAll(/'(\w+)'/g)].map((m) => m[1])
    }
    const detailFields = arrayOf(detail, 'getPlaceDetails')
    const listFields = arrayOf(read('app/saved/saved-list-screen.tsx'), 'getPlaceDetails')
    assert.deepEqual(detailFields, ['displayName', 'formattedAddress', 'addressComponents'])
    assert.deepEqual(listFields, ['displayName', 'formattedAddress', 'addressComponents'])
  })

  it('場所の候補の配列と place-details-disclosure.tsx の配列は addressComponents を含まない', () => {
    const map = read('app/map/map-screen.tsx')
    assert.ok(map.includes("fetchPlaceFields(place, ['location', 'viewport'])"))
    assert.doesNotMatch(read('app/map/place-details-disclosure.tsx'), /addressComponents/)
  })
})

describe('T4 en の辞書の値(web.japaneseName)', () => {
  const valueOf = (src, key) => {
    const block = src.slice(src.indexOf('japaneseName: {'))
    const m = block.match(new RegExp(`${key}: '([^']*)'`))
    assert.ok(m, key)
    return m[1]
  }

  it('en の 4 つの値が、決まった文と一字違わない', () => {
    assert.equal(valueOf(MESSAGES.en, 'show'), 'Show name in Japanese')
    assert.equal(valueOf(MESSAGES.en, 'none'), 'No Japanese name.')
    assert.equal(valueOf(MESSAGES.en, 'same'), 'Same as the name above.')
    assert.equal(valueOf(MESSAGES.en, 'failed'), 'Couldn’t load the Japanese name.')
  })

  it('4 つの文が互いに違う(same と none を同じ文にしない)', () => {
    const values = ['show', 'none', 'same', 'failed'].map((key) => valueOf(MESSAGES.en, key))
    assert.equal(new Set(values).size, 4)
  })
})
