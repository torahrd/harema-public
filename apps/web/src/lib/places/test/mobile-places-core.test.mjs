// T-W5・T-W6: mobile の受け口が Google に送る要求(mask・URL・本文)と、応答の読み取り、入力のスキーマ。
// 実行: `pnpm --filter web test`(register-ts-resolve.mjs を --import する。shared の拡張子なしの import を解くため)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyPlaceTypes, isFoodPlaceType } from '../../../../../../packages/shared/constants/place-types.ts'
import {
  mobileAutocompleteRequestSchema,
  mobilePlaceDetailsRequestSchema,
  mobileSourceTitleRequestSchema,
} from '../../../../../../packages/shared/validations/mobile-api.ts'
import {
  AUTOCOMPLETE_FIELD_MASK,
  AUTOCOMPLETE_URL,
  DETAILS_FIELD_MASKS,
  buildAutocompleteRequest,
  buildDetailsRequest,
  readAutocompleteResponse,
  readDetailsResponse,
} from '../mobile-places-core.ts'

const TOKEN36 = 'a'.repeat(36)
const bias = { south: 35.6, west: 139.7, north: 35.7, east: 139.8 }

describe('T-W5 用途 → mask と URL', () => {
  it('5 用途の mask が計画の表の文字列と一字違わない', () => {
    assert.deepEqual(DETAILS_FIELD_MASKS, {
      select_food: 'location,displayName,formattedAddress',
      select_location: 'location,viewport',
      poi: 'types,displayName,location,formattedAddress',
      summary: 'displayName,formattedAddress',
      enterprise: 'regularOpeningHours,nationalPhoneNumber,websiteUri',
    })
    assert.equal(
      AUTOCOMPLETE_FIELD_MASK,
      'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
    )
  })

  it('表に無い用途 → 投げる(prototype の名前も通さない)', () => {
    assert.throws(() => buildDetailsRequest('ChIJx', 'photos'))
    assert.throws(() => buildDetailsRequest('ChIJx', 'constructor'))
    assert.throws(() => buildDetailsRequest('ChIJx', '__proto__'))
  })

  it('sessionToken は select_* だけ URL に載り、poi・summary・enterprise には載らない', () => {
    for (const purpose of ['select_food', 'select_location']) {
      assert.ok(buildDetailsRequest('ChIJx', purpose, TOKEN36).url.includes(`sessionToken=${TOKEN36}`), purpose)
    }
    for (const purpose of ['poi', 'summary', 'enterprise']) {
      assert.ok(!buildDetailsRequest('ChIJx', purpose, TOKEN36).url.includes('sessionToken'), purpose)
    }
    assert.ok(!buildDetailsRequest('ChIJx', 'select_food').url.includes('sessionToken'))
  })

  it('languageCode=ja・regionCode=JP・mask は用途の表のとおり', () => {
    const built = buildDetailsRequest('ChIJx', 'summary')
    const url = new URL(built.url)
    assert.equal(url.searchParams.get('languageCode'), 'ja')
    assert.equal(url.searchParams.get('regionCode'), 'JP')
    assert.equal(built.fieldMask, 'displayName,formattedAddress')
  })

  it('place ID の / ? # は encodeURIComponent され、宛先の origin は places.googleapis.com だけ', () => {
    const built = buildDetailsRequest('a/b?c#d e', 'summary')
    const url = new URL(built.url)
    assert.equal(url.origin, 'https://places.googleapis.com')
    assert.equal(url.pathname, '/v1/places/a%2Fb%3Fc%23d%20e')
    assert.equal(url.hash, '')
    const evil = new URL(buildDetailsRequest('../../evil.example.com/x', 'summary').url)
    assert.equal(evil.origin, 'https://places.googleapis.com')
    assert.equal(new URL(AUTOCOMPLETE_URL).origin, 'https://places.googleapis.com')
  })

  it('Autocomplete の本文: 矩形は low = 南西・high = 北東・ja / JP・札・入力', () => {
    const request = mobileAutocompleteRequestSchema.parse({ input: ' ラーメン ', sessionToken: TOKEN36, locationBias: bias })
    const built = buildAutocompleteRequest(request)
    assert.equal(built.url, 'https://places.googleapis.com/v1/places:autocomplete')
    assert.deepEqual(built.body, {
      input: 'ラーメン',
      languageCode: 'ja',
      regionCode: 'JP',
      sessionToken: TOKEN36,
      locationBias: {
        rectangle: {
          low: { latitude: 35.6, longitude: 139.7 },
          high: { latitude: 35.7, longitude: 139.8 },
        },
      },
    })
  })
})

describe('T-W5 入力のスキーマ', () => {
  const ok = { input: 'ramen', sessionToken: TOKEN36, locationBias: bias }
  it('札 36 文字 → 通る・37 文字 → 拒む・15 文字 → 拒む・記号 → 拒む', () => {
    assert.equal(mobileAutocompleteRequestSchema.safeParse(ok).success, true)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, sessionToken: 'a'.repeat(37) }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, sessionToken: 'a'.repeat(15) }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, sessionToken: `${'a'.repeat(20)}/../x` }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, sessionToken: '123e4567-e89b-12d3-a456-426614174000' }).success, true)
  })

  it('locationBias が無い → 拒む / south > north → 拒む / 範囲外・非有限 → 拒む', () => {
    const withoutBias = { input: ok.input, sessionToken: ok.sessionToken }
    assert.equal(mobileAutocompleteRequestSchema.safeParse(withoutBias).success, false)
    assert.equal(
      mobileAutocompleteRequestSchema.safeParse({ ...ok, locationBias: { ...bias, south: 36, north: 35 } }).success,
      false,
    )
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, locationBias: { ...bias, north: 91 } }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, locationBias: { ...bias, west: -181 } }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, locationBias: { ...bias, east: null } }).success, false)
  })

  it('input: 空・空白だけ・101 文字 → 拒む / 100 文字 → 通る(コードポイント)', () => {
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, input: '' }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, input: '   ' }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, input: 'a'.repeat(101) }).success, false)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, input: 'a'.repeat(100) }).success, true)
    assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...ok, input: '😀'.repeat(100) }).success, true)
  })

  it('Details の要求: 用途は 5 値だけ・sessionToken は select_* だけ受ける', () => {
    const base = { placeId: 'ChIJx' }
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'photos' }).success, false)
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'select_food', sessionToken: TOKEN36 }).success, true)
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'select_location', sessionToken: TOKEN36 }).success, true)
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'select_food' }).success, true)
    for (const purpose of ['poi', 'summary', 'enterprise']) {
      assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose, sessionToken: TOKEN36 }).success, false, purpose)
      assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose }).success, true, purpose)
    }
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ placeId: '', purpose: 'poi' }).success, false)
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'poi', fieldMask: '*' }).success, true, '余分な key は捨てる(mask は選べない)')
    assert.equal('fieldMask' in mobilePlaceDetailsRequestSchema.parse({ ...base, purpose: 'poi', fieldMask: '*' }), false)
  })

  it('出典タイトルの要求: url は文字列で 1000 文字以内', () => {
    assert.equal(mobileSourceTitleRequestSchema.safeParse({ url: 'https://example.com' }).success, true)
    assert.equal(mobileSourceTitleRequestSchema.safeParse({ url: 5 }).success, false)
    assert.equal(mobileSourceTitleRequestSchema.safeParse({ url: 'x'.repeat(1001) }).success, false)
  })
})

describe('T-W6 応答の読み取り', () => {
  const prediction = (placeId, types, main = '店', secondary = '東京') => ({
    placePrediction: {
      placeId,
      types,
      structuredFormat: { mainText: { text: main }, secondaryText: { text: secondary } },
    },
  })

  it('候補: 飲食・場所に分かれ、どちらでもない候補は消え、types が返りの形に無い', () => {
    const groups = readAutocompleteResponse(
      {
        suggestions: [
          prediction('r1', ['restaurant', 'food', 'establishment'], 'ラーメン店', '渋谷'),
          prediction('s1', ['train_station', 'transit_station'], '渋谷駅', '東京'),
          prediction('x1', ['store', 'establishment']),
          { queryPrediction: { text: { text: 'ramen' } } },
        ],
      },
      classifyPlaceTypes,
    )
    assert.deepEqual(groups, {
      food: [{ placeId: 'r1', mainText: 'ラーメン店', secondaryText: '渋谷' }],
      location: [{ placeId: 's1', mainText: '渋谷駅', secondaryText: '東京' }],
    })
    assert.ok(!JSON.stringify(groups).includes('types'))
  })

  it('候補 0 件({})→ 空の 2 群 / 形の違う応答 → null(投げない)', () => {
    assert.deepEqual(readAutocompleteResponse({}, classifyPlaceTypes), { food: [], location: [] })
    for (const bad of [null, 'x', 5, [], { suggestions: 'x' }]) {
      assert.equal(readAutocompleteResponse(bad, classifyPlaceTypes), null, JSON.stringify(bad))
    }
    const weird = readAutocompleteResponse(
      { suggestions: [null, 5, { placePrediction: null }, { placePrediction: { placeId: 5 } }, prediction('', ['cafe'])] },
      classifyPlaceTypes,
    )
    assert.deepEqual(weird, { food: [], location: [] })
  })

  it('poi: 飲食でない → { food: false } だけ(店名なし)/ 飲食 → 店名・住所・座標', () => {
    const notFood = readDetailsResponse(
      'poi',
      { types: ['park'], displayName: { text: '公園' }, location: { latitude: 1, longitude: 2 }, formattedAddress: '住所' },
      isFoodPlaceType,
    )
    assert.deepEqual(notFood, { ok: true, purpose: 'poi', food: false })
    const food = readDetailsResponse(
      'poi',
      { types: ['cafe'], displayName: { text: '喫茶' }, location: { latitude: 35, longitude: 139 }, formattedAddress: '東京' },
      isFoodPlaceType,
    )
    assert.deepEqual(food, {
      ok: true,
      purpose: 'poi',
      food: true,
      displayName: '喫茶',
      formattedAddress: '東京',
      location: { lat: 35, lng: 139 },
    })
    assert.deepEqual(
      readDetailsResponse('poi', { types: ['cafe'], displayName: { text: 'x' } }, isFoodPlaceType),
      { ok: true, purpose: 'poi', food: false },
    )
  })

  it('select_food・select_location・summary・enterprise の形', () => {
    assert.deepEqual(
      readDetailsResponse(
        'select_food',
        { location: { latitude: 35, longitude: 139 }, displayName: { text: '店' }, formattedAddress: '住所' },
        isFoodPlaceType,
      ),
      { ok: true, purpose: 'select_food', displayName: '店', formattedAddress: '住所', location: { lat: 35, lng: 139 } },
    )
    assert.deepEqual(
      readDetailsResponse(
        'select_location',
        {
          location: { latitude: 35, longitude: 139 },
          viewport: { low: { latitude: 34, longitude: 138 }, high: { latitude: 36, longitude: 140 } },
        },
        isFoodPlaceType,
      ),
      {
        ok: true,
        purpose: 'select_location',
        location: { lat: 35, lng: 139 },
        viewport: { south: 34, west: 138, north: 36, east: 140 },
      },
    )
    assert.equal(
      readDetailsResponse('select_location', { location: { latitude: 35, longitude: 139 } }, isFoodPlaceType).viewport,
      null,
    )
    assert.deepEqual(
      readDetailsResponse('summary', { displayName: { text: '店' }, formattedAddress: '住所' }, isFoodPlaceType),
      { ok: true, purpose: 'summary', displayName: '店', formattedAddress: '住所' },
    )
    assert.deepEqual(
      readDetailsResponse(
        'enterprise',
        {
          regularOpeningHours: { weekdayDescriptions: ['月曜日: 9:00~17:00', 5, '火曜日: 休み'] },
          nationalPhoneNumber: '03-1234-5678',
          websiteUri: 'https://example.com/',
        },
        isFoodPlaceType,
      ),
      {
        ok: true,
        purpose: 'enterprise',
        weekdayDescriptions: ['月曜日: 9:00~17:00', '火曜日: 休み'],
        nationalPhoneNumber: '03-1234-5678',
        websiteUri: 'https://example.com/',
      },
    )
  })

  it('enterprise: 欠落は null / http(s) でない websiteUri は null', () => {
    assert.deepEqual(readDetailsResponse('enterprise', {}, isFoodPlaceType), {
      ok: true,
      purpose: 'enterprise',
      weekdayDescriptions: null,
      nationalPhoneNumber: null,
      websiteUri: null,
    })
    assert.equal(
      readDetailsResponse('enterprise', { websiteUri: 'javascript:alert(1)' }, isFoodPlaceType).websiteUri,
      null,
    )
  })

  it('形の違う応答 → null(投げない)', () => {
    for (const purpose of ['select_food', 'select_location', 'poi', 'summary', 'enterprise']) {
      for (const bad of [null, 'x', 5, []]) {
        assert.equal(readDetailsResponse(purpose, bad, isFoodPlaceType), null, `${purpose} ${JSON.stringify(bad)}`)
      }
    }
    assert.equal(readDetailsResponse('select_food', { location: { latitude: 'a', longitude: 1 } }, isFoodPlaceType), null)
    assert.equal(readDetailsResponse('select_food', { displayName: { text: 'x' } }, isFoodPlaceType), null)
  })
})
