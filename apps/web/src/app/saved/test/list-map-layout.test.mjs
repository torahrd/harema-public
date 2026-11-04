// 一覧の上の地図(list-map)の寸法・ピン・範囲・ソースの確かめ。
// 実行: `pnpm --filter web test`(node の type stripping で list-map-layout.ts を直接読む)
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  ADDRESS_GAP,
  ADDRESS_SLOT_HEIGHT,
  LIST_ROW_HEIGHT,
  LIST_VISIBLE_ROWS,
  NAME_SLOT_HEIGHT,
  ROW_BORDER,
  ROW_PADDING_Y,
  cameraForMarkers,
  listRegionHeight,
  markersForTab,
  toListPosition,
} from '../list-map-layout.ts'

const here = new URL('..', import.meta.url).pathname
const read = (name) => readFileSync(join(here, name), 'utf8')

describe('寸法', () => {
  it('listRegionHeight は 行数 × 70 − 10', () => {
    assert.equal(listRegionHeight(6), 410)
    assert.equal(listRegionHeight(4), 270)
    assert.equal(listRegionHeight(3), 200)
    assert.equal(LIST_VISIBLE_ROWS, 4)
  })
  it('行の内訳の和が LIST_ROW_HEIGHT と一致する', () => {
    assert.equal(
      ROW_PADDING_Y * 2 + NAME_SLOT_HEIGHT + ADDRESS_GAP + ADDRESS_SLOT_HEIGHT + ROW_BORDER,
      LIST_ROW_HEIGHT,
    )
    assert.equal(LIST_ROW_HEIGHT, 70)
  })
})

describe('ピンと範囲', () => {
  it('番号はそのタブの行の並びの 1 始まり', () => {
    assert.deepEqual(markersForTab(rows, 'want_to_go').map((m) => m.number), [1, 2])
  })
  it('position が null の行はピンにならない', () => {
    assert.deepEqual(markersForTab([{ id: 'x', status: 'want_to_go', position: null }], 'want_to_go'), [])
  })
  const rows = [
    { id: 'a', status: 'want_to_go', position: { lat: 35, lng: 139 } },
    { id: 'b', status: 'visit_again', position: { lat: 36, lng: 140 } },
    { id: 'c', status: 'no_thanks', position: { lat: 33, lng: 142 } },
    { id: 'd', status: 'want_to_go', position: { lat: 34, lng: 141 } },
  ]
  it('markersForTab はそのタブの行だけをピンにする', () => {
    assert.deepEqual(markersForTab(rows, 'want_to_go').map((m) => m.id), ['a', 'd'])
    assert.deepEqual(markersForTab(rows, 'visit_again'), [
      { id: 'b', status: 'visit_again', position: { lat: 36, lng: 140 }, number: 1 },
    ])
    assert.deepEqual(markersForTab(rows, 'no_thanks').map((m) => m.id), ['c'])
  })
  it('cameraForMarkers は 0 件・1 件・2 件以上を分ける', () => {
    const center = { lat: 1, lng: 2 }
    assert.deepEqual(cameraForMarkers([], center, 14), { kind: 'center', center, zoom: 14 })
    assert.deepEqual(cameraForMarkers([{ position: { lat: 35, lng: 139 } }], center, 14), {
      kind: 'center',
      center: { lat: 35, lng: 139 },
      zoom: 14,
    })
    assert.deepEqual(
      cameraForMarkers(
        [
          { position: { lat: 35, lng: 139 } },
          { position: { lat: 36, lng: 138 } },
          { position: { lat: 34, lng: 141 } },
        ],
        center,
        14,
      ),
      { kind: 'bounds', bounds: { north: 36, south: 34, east: 141, west: 138 } },
    )
  })
  it('toListPosition は 3 状態とも座標を返す(もういいも)', () => {
    assert.deepEqual(toListPosition('want_to_go', 35, 139), { lat: 35, lng: 139 })
    assert.deepEqual(toListPosition('visit_again', 35, 139), { lat: 35, lng: 139 })
    assert.deepEqual(toListPosition('no_thanks', 35, 139), { lat: 35, lng: 139 })
  })
  it('toListPosition は座標が消えた行(null)を null にしてピンにしない', () => {
    assert.equal(toListPosition('want_to_go', null, null), null)
    assert.equal(toListPosition('no_thanks', 35, null), null)
    assert.equal(toListPosition('visit_again', null, 139), null)
  })
})

describe('ソースの確かめ', () => {
  it('一覧の行は先読みしない(rootMargin・threshold なし)で、一覧の器の高さは listRegionHeight', () => {
    const src = read('saved-list-screen.tsx')
    assert.equal(src.match(/rootMargin:/g)?.length ?? 0, 0)
    assert.equal(src.match(/threshold:/g)?.length ?? 0, 0)
    assert.ok(src.includes('listRegionHeight(LIST_VISIBLE_ROWS)'))
    assert.match(src, /from '\.\/list-map-layout'/)
    assert.ok(src.includes('ROW_PADDING_Y') && src.includes('NAME_SLOT_HEIGHT'))
  })
  it('ピンを押したときの一覧のスクロールは即時で、滑らかにしない', () => {
    const src = read('saved-list-screen.tsx')
    assert.equal(src.match(/'smooth'/g)?.length ?? 0, 0)
    assert.equal(src.match(/scrollIntoView/g)?.length ?? 0, 0)
    assert.ok((src.match(/'instant'/g)?.length ?? 0) >= 1)
    assert.ok(src.includes('data-saved-row-id'))
    // 上の行の下端が領域の上端に接すると交差に数えられる(B4)。行の上端ちょうどへは動かさない。
    assert.match(src, /top: rowElement\.offsetTop \+ 1,/)
  })
  it('一覧の select は /map と同じ座標の列だけを足す', () => {
    const src = read('page.tsx')
    const m = src.match(/\.from\('saved_places'\)\s*\.select\(\s*'([^']*)'/)
    assert.equal(m?.[1], 'id, status, created_at, places(google_place_id, latitude, longitude, cached_at)')
    assert.equal(src.match(/\.eq\('user_id'/g)?.length ?? 0, 0)
    assert.ok((src.match(/refreshStalePlaces/g)?.length ?? 0) >= 1)
  })
  it('一覧の画面の 30 日の取り直しは もういい の行だけ(行きたい・また行きたいは地図画面の担当)', () => {
    const src = read('page.tsx')
    const start = src.indexOf('after(')
    const end = src.indexOf('const savedRows')
    assert.ok(start >= 0 && end > start)
    assert.match(src.slice(start, end), /row\.status === 'no_thanks'/)
  })
  it('一覧の地図の <Map> は 1 つで、key を持たず、作り直しの props が定数', () => {
    const src = read('saved-list-map.tsx')
    assert.equal(src.match(/<Map\s/g)?.length ?? 0, 1)
    assert.equal(src.match(/<Map\s[^>]*\bkey=/g)?.length ?? 0, 0)
    assert.equal(src.match(/mapId=\{clientEnv\.googleMapsMapId\}/g)?.length ?? 0, 1)
    assert.equal(src.match(/colorScheme=\{ColorScheme\.FOLLOW_SYSTEM\}/g)?.length ?? 0, 1)
    assert.equal(src.match(/renderingType/g)?.length ?? 0, 0)
  })
  it('一覧の地図は Places の取得口を使わない', () => {
    const src = read('saved-list-map.tsx')
    assert.equal(src.match(/from '@\/lib\/places\//g)?.length ?? 0, 0)
    assert.equal(src.match(/useMapsLibrary\('places'\)/g)?.length ?? 0, 0)
    assert.equal(src.match(/fetchFields\(/g)?.length ?? 0, 0)
  })
  it('地図の失敗の文は 1 か所にあり、地図画面と一覧の地図が同じカードを使う', () => {
    const appDir = join(here, '..')
    const hits = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
          if (name !== 'test') walk(p)
        } else if (/\.tsx?$/.test(name) && readFileSync(p, 'utf8').includes("'地図を表示できませんでした'")) {
          hits.push(p)
        }
      }
    }
    walk(appDir)
    assert.equal(hits.length, 1)
    assert.ok(hits[0].endsWith('map/maps-load-fail-card.tsx'))
    assert.match(readFileSync(join(appDir, 'map/map-screen.tsx'), 'utf8'), /import \{ MapsLoadFailCard \}/)
    assert.match(read('saved-list-map.tsx'), /import \{ MapsLoadFailCard \}/)
  })
})
