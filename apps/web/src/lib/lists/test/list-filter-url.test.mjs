// lists-filter-carry T2: リストの絞りを URL の query に出し入れする純粋な関数。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIST_PARAM, parseListParam, pathWithList, searchWithList } from '../list-filter-url.ts'

const A = '3f1c2b9e-7a44-4d6b-9c1e-0a5b8d2e4f10'
const B = '8d2e4f10-3f1c-4b9e-8a44-6d6b9c1e0a5b'

describe('lists-filter-carry T2 URL の list', () => {
  it('lists-filter-carry query の名前は list', () => {
    assert.equal(LIST_PARAM, 'list')
  })
  it('lists-filter-carry parseListParam は uuid の文字列だけを通す', () => {
    assert.equal(parseListParam(A), A)
    assert.equal(parseListParam(undefined), null)
    assert.equal(parseListParam(null), null)
    assert.equal(parseListParam('abc'), null)
    assert.equal(parseListParam(`${A}&x=1`), null)
    assert.equal(parseListParam(''), null)
  })
  it('lists-filter-carry searchWithList は list だけを足す・消す', () => {
    assert.equal(searchWithList('', A), `?list=${A}`)
    assert.equal(searchWithList('?status=visit_again', A), `?status=visit_again&list=${A}`)
    assert.equal(searchWithList(`?status=visit_again&list=${B}`, A), `?status=visit_again&list=${A}`)
    assert.equal(searchWithList(`?status=visit_again&list=${A}`, null), '?status=visit_again')
    assert.equal(searchWithList(`?list=${A}`, null), '')
    assert.equal(searchWithList('', null), '')
  })
  it('lists-filter-carry pathWithList は path に絞りを付ける(すべてなら付けない)', () => {
    assert.equal(pathWithList('/saved', A), `/saved?list=${A}`)
    assert.equal(pathWithList('/map', null), '/map')
    assert.equal(pathWithList('/map', B), `/map?list=${B}`)
  })
  it('lists-screen pathWithList は「リスト」の画面(/lists)にも絞りを付ける', () => {
    assert.equal(pathWithList('/lists', A), `/lists?list=${A}`)
    assert.equal(pathWithList('/lists', null), '/lists')
  })
})
