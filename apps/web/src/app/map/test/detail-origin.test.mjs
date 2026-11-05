// 詳細の戻る先(detail-origin.ts)。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { detailBack, placeDetailHrefFromMap } from '../detail-origin.ts'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const count = (text, needle) => text.split(needle).length - 1
const UUID = '8f14e45f-ceea-4e67-a1b2-0123456789ab'

describe('detailBack', () => {
  it('from=map だけ地図へ', () => {
    assert.deepEqual(detailBack('map'), { href: '/map', label: '地図へ戻る' })
  })

  it('無い・ほかの値・配列は一覧へ', () => {
    for (const v of [undefined, '', 'MAP', '/map', 'saved', 'https://example.com', ['map'], ['map', 'map']]) {
      assert.deepEqual(detailBack(v), { href: '/saved', label: '一覧へ戻る' }, String(v))
    }
  })

  it('地図のピンの行き先を読み直すと地図へ戻る', () => {
    const url = new URL(placeDetailHrefFromMap(UUID), 'http://localhost')
    assert.equal(url.pathname, `/places/${UUID}`)
    assert.equal(detailBack(url.searchParams.get('from')).href, '/map')
  })
})

describe('配線(ソース照合)', () => {
  it('地図のピンは押すと詳細へ行くだけ(配線)', () => {
    const src = read('../map-screen.tsx')
    const i = src.indexOf('savedPlaces.map(')
    assert.notEqual(i, -1)
    const j = src.indexOf('</AdvancedMarker>', i)
    assert.notEqual(j, -1)
    const block = src.slice(i, j)
    assert.equal(count(block, 'onClick='), 1)
    assert.equal(count(block, 'router.push(placeDetailHrefFromMap(marker.id))'), 1)
    assert.equal(count(block, 'getPlaceDetails'), 0)
    assert.equal(count(block, 'fetchPlaceFields'), 0)
  })

  it('詳細の戻るは back から取り、削除の後は一覧のまま(配線)', () => {
    const screen = read('../../places/[id]/place-detail-screen.tsx')
    assert.equal(count(screen, 'href="/saved"'), 0)
    assert.equal(count(screen, 'aria-label={DETAIL_BACK_LABEL}'), 0)
    assert.ok(count(screen, 'back.label') >= 1)
    assert.equal(count(screen, "router.replace('/saved')"), 1)
    const page = read('../../places/[id]/page.tsx')
    assert.ok(count(page, 'detailBack(') >= 1)
  })
})
