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
  it('6 用途の mask が計画の表の文字列と一字違わない', () => {
    assert.deepEqual(DETAILS_FIELD_MASKS, {
      select_food: 'location,displayName,formattedAddress,addressComponents',
      select_location: 'location,viewport',
      poi: 'types,displayName,location,formattedAddress,addressComponents',
      summary: 'displayName,formattedAddress,addressComponents',
      enterprise: 'regularOpeningHours,nationalPhoneNumber,websiteUri',
      name_ja: 'displayName',
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
    assert.equal(built.fieldMask, 'displayName,formattedAddress,addressComponents')
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

  it('Details の要求: 用途は 6 値だけ・sessionToken は select_* だけ受ける', () => {
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
      // rank = 残した候補の Google の順(捨てた x1・queryPrediction は数えない): r1 → 0・s1 → 1
      food: [{ placeId: 'r1', mainText: 'ラーメン店', secondaryText: '渋谷', rank: 0 }],
      location: [{ placeId: 's1', mainText: '渋谷駅', secondaryText: '東京', rank: 1 }],
    })
    assert.ok(!JSON.stringify(groups).includes('types'))
  })

  it('SV-1 候補の rank: 捨てた候補(先頭・途中)は数えず、群ごとでなく通しの番号', () => {
    const groups = readAutocompleteResponse(
      {
        suggestions: [
          prediction('x1', ['store', 'establishment']),
          prediction('s1', ['train_station', 'transit_station'], '渋谷駅', '東京'),
          { queryPrediction: { text: { text: 'ramen' } } },
          prediction('r1', ['restaurant', 'food', 'establishment'], 'ラーメン店', '渋谷'),
        ],
      },
      classifyPlaceTypes,
    )
    assert.equal(groups.location[0].rank, 0)
    assert.equal(groups.food[0].rank, 1)
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
      displayNameLanguageCode: null,
      countryCode: null,
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
      {
        ok: true,
        purpose: 'select_food',
        displayName: '店',
        displayNameLanguageCode: null,
        countryCode: null,
        formattedAddress: '住所',
        location: { lat: 35, lng: 139 },
      },
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
      { ok: true, purpose: 'summary', displayName: '店', displayNameLanguageCode: null, countryCode: null, formattedAddress: '住所' },
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

// T6・T7(i18n PR3): 検証した言語だけを Google の languageCode に渡す。regionCode は常に JP。`language` の無い要求(古い iOS 1.0.1)は ja。
describe('T6 language(検証した言語だけを Google に渡す)', () => {
  const base = { input: 'ramen', sessionToken: TOKEN36, locationBias: bias }
  const detailsBase = { placeId: 'ChIJx', purpose: 'summary' }

  it('Autocomplete: language=en → languageCode=en / ja → ja / 省略 → ja。regionCode は常に JP', () => {
    for (const [language, expected] of [['en', 'en'], ['ja', 'ja'], [undefined, 'ja']]) {
      const request = mobileAutocompleteRequestSchema.parse({ ...base, ...(language === undefined ? {} : { language }) })
      const built = buildAutocompleteRequest(request)
      assert.equal(built.body.languageCode, expected, String(language))
      assert.equal(built.body.regionCode, 'JP')
    }
  })

  it('Details: language=en → languageCode=en / 省略 → ja。regionCode は常に JP', () => {
    for (const [language, expected] of [['en', 'en'], ['ja', 'ja'], [undefined, 'ja']]) {
      const request = mobilePlaceDetailsRequestSchema.parse({ ...detailsBase, ...(language === undefined ? {} : { language }) })
      const built = buildDetailsRequest(request.placeId, request.purpose, request.sessionToken, request.language)
      const url = new URL(built.url)
      assert.equal(url.searchParams.get('languageCode'), expected, String(language))
      assert.equal(url.searchParams.get('regionCode'), 'JP')
    }
  })

  it('核の関数は language を渡さなくても ja(単体の呼び出しの備え)', () => {
    assert.equal(buildAutocompleteRequest(base).body.languageCode, 'ja')
    assert.equal(new URL(buildDetailsRequest('ChIJx', 'summary').url).searchParams.get('languageCode'), 'ja')
  })

  it('Zod: 許可リスト(ja・en)以外は拒む(fr・差し込みの試し・数・空・大文字)', () => {
    for (const language of ['fr', 'en; x', 'en&x=1', 'EN', '', 1, null, ['en']]) {
      assert.equal(mobileAutocompleteRequestSchema.safeParse({ ...base, language }).success, false, JSON.stringify(language))
      assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...detailsBase, language }).success, false, JSON.stringify(language))
    }
  })
})

describe('T7 古い iOS(language を送らない)と新しいサーバの組', () => {
  it('language の無い要求は通り、ja が補われる', () => {
    const a = mobileAutocompleteRequestSchema.parse({ input: 'ramen', sessionToken: TOKEN36, locationBias: bias })
    assert.equal(a.language, 'ja')
    const d = mobilePlaceDetailsRequestSchema.parse({ placeId: 'ChIJx', purpose: 'summary' })
    assert.equal(d.language, 'ja')
  })
})

// ── ja-name(英語の画面の日本語の店名。harema#219)JN-1〜JN-5 ─────────────────────────────

describe('JN-1 name_ja の mask と言語', () => {
  it('JN-1a name_ja の mask は displayName だけ', () => {
    assert.equal(DETAILS_FIELD_MASKS.name_ja, 'displayName')
    assert.equal(buildDetailsRequest('ChIJx', 'name_ja').fieldMask, 'displayName')
    assert.equal(buildDetailsRequest('ChIJx', 'name_ja', undefined, 'en').fieldMask, 'displayName')
  })

  it('JN-1b name_ja の languageCode は、language が en でも省略でも ja(regionCode=JP・sessionToken は載らない)', () => {
    for (const language of ['en', 'ja', undefined]) {
      const url = new URL(buildDetailsRequest('ChIJx', 'name_ja', undefined, language).url)
      assert.equal(url.searchParams.get('languageCode'), 'ja', String(language))
      assert.equal(url.searchParams.get('regionCode'), 'JP')
      assert.equal(url.searchParams.has('sessionToken'), false)
    }
    // 札を渡されても name_ja の URL には載せない
    assert.ok(!buildDetailsRequest('ChIJx', 'name_ja', TOKEN36, 'en').url.includes('sessionToken'))
    // 表の外の用途は、今までどおり要求の language を使う
    assert.equal(new URL(buildDetailsRequest('ChIJx', 'summary', undefined, 'en').url).searchParams.get('languageCode'), 'en')
  })
})

describe('JN-2 Zod: 用途は 6 値だけ・name_ja に sessionToken は拒む', () => {
  const base = { placeId: 'ChIJx' }
  it('name_ja は通る(language が en でも通り、サーバが ja に固定する)', () => {
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'name_ja' }).success, true)
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'name_ja', language: 'en' }).success, true)
  })

  it('name_en・displayName・__proto__ は拒む / 札付きの name_ja は拒む', () => {
    for (const purpose of ['name_en', 'displayName', '__proto__', 'constructor', 'name_JA']) {
      assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose }).success, false, purpose)
    }
    assert.equal(mobilePlaceDetailsRequestSchema.safeParse({ ...base, purpose: 'name_ja', sessionToken: TOKEN36 }).success, false)
  })

  it('用途の許可リストは 6 値(5 つの今の用途 + name_ja)', () => {
    assert.deepEqual(Object.keys(DETAILS_FIELD_MASKS).sort(), ['enterprise', 'name_ja', 'poi', 'select_food', 'select_location', 'summary'])
  })
})

describe('JN-3 name_ja の応答は 4 つだけ', () => {
  it('Google の応答に住所・座標・types が混ざっていても、返す形の鍵は ok・purpose・displayName・displayNameLanguageCode', () => {
    const read = readDetailsResponse(
      'name_ja',
      {
        displayName: { text: '天ぷら 一心', languageCode: 'ja' },
        formattedAddress: '住所',
        location: { latitude: 35, longitude: 139 },
        types: ['restaurant'],
      },
      isFoodPlaceType,
    )
    assert.deepEqual(read, { ok: true, purpose: 'name_ja', displayName: '天ぷら 一心', displayNameLanguageCode: 'ja' })
    assert.deepEqual(Object.keys(read).sort(), ['displayName', 'displayNameLanguageCode', 'ok', 'purpose'])
  })

  it('名前の無い応答は空の店名・言語 null(失敗にしない)', () => {
    assert.deepEqual(readDetailsResponse('name_ja', {}, isFoodPlaceType), {
      ok: true,
      purpose: 'name_ja',
      displayName: '',
      displayNameLanguageCode: null,
    })
  })
})

describe('JN-4 displayNameLanguageCode(形の違う値は null)', () => {
  const food = { types: ['cafe'], location: { latitude: 35, longitude: 139 }, formattedAddress: '東京' }
  const read = (purpose, displayName) => readDetailsResponse(purpose, { ...food, displayName, formattedAddress: '東京' }, isFoodPlaceType)

  it('select_food・poi(飲食)・summary・name_ja が、言語タグの形の languageCode をそのまま返す', () => {
    for (const purpose of ['select_food', 'poi', 'summary', 'name_ja']) {
      assert.equal(read(purpose, { text: 'Cafe', languageCode: 'en' }).displayNameLanguageCode, 'en', purpose)
      assert.equal(read(purpose, { text: 'カフェ', languageCode: 'ja-JP' }).displayNameLanguageCode, 'ja-JP', purpose)
      assert.equal(read(purpose, { text: 'Cafe', languageCode: 'zh-Hant-TW' }).displayNameLanguageCode, 'zh-Hant-TW', purpose)
    }
  })

  it('languageCode が無い・数・長い文字列・記号入り・空 → null', () => {
    const bad = [undefined, 5, null, '', 'a'.repeat(100), `en-${'x'.repeat(40)}`, 'en; x', 'en&x=1', '<script>', 'e', ['en'], { x: 1 }]
    for (const purpose of ['select_food', 'poi', 'summary', 'name_ja']) {
      for (const languageCode of bad) {
        assert.equal(read(purpose, { text: 'Cafe', languageCode }).displayNameLanguageCode, null, `${purpose} ${JSON.stringify(languageCode)}`)
      }
    }
    // displayName が文字列など object でない時も null(店名は空)
    assert.equal(read('summary', 'Cafe').displayNameLanguageCode, null)
  })
})

describe('JN-5 古い iOS(language なし・5 用途)の要求は前と同じ', () => {
  it('5 用途の mask は一字も変わらず、language の無い要求は languageCode=ja', () => {
    // 3 用途(select_food・poi・summary)だけ、国を見分ける addressComponents が末尾に足される(JN-C1)。ほかは前の字のまま
    const expected = {
      select_food: 'location,displayName,formattedAddress,addressComponents',
      select_location: 'location,viewport',
      poi: 'types,displayName,location,formattedAddress,addressComponents',
      summary: 'displayName,formattedAddress,addressComponents',
      enterprise: 'regularOpeningHours,nationalPhoneNumber,websiteUri',
    }
    for (const [purpose, mask] of Object.entries(expected)) {
      const request = mobilePlaceDetailsRequestSchema.parse({ placeId: 'ChIJx', purpose })
      const built = buildDetailsRequest(request.placeId, request.purpose, request.sessionToken, request.language)
      assert.equal(built.fieldMask, mask, purpose)
      assert.equal(new URL(built.url).searchParams.get('languageCode'), 'ja', purpose)
      assert.equal(new URL(built.url).searchParams.get('regionCode'), 'JP', purpose)
    }
  })
})

// ── 国の見分け(英語の画面の日本語の店名の札・harema#219)JN-C1・JN-C2 ──────────────────

describe('JN-C1 国を見分ける mask', () => {
  it('select_food・poi・summary の mask の末尾に addressComponents(一字違わない)。ほかの用途には無い', () => {
    assert.equal(DETAILS_FIELD_MASKS.select_food, 'location,displayName,formattedAddress,addressComponents')
    assert.equal(DETAILS_FIELD_MASKS.poi, 'types,displayName,location,formattedAddress,addressComponents')
    assert.equal(DETAILS_FIELD_MASKS.summary, 'displayName,formattedAddress,addressComponents')
    for (const purpose of ['select_location', 'enterprise', 'name_ja']) {
      assert.ok(!DETAILS_FIELD_MASKS[purpose].includes('addressComponents'), purpose)
    }
  })

  it('mask は言語で変わらない(en でも ja でも、言語の無い要求でも同じ)', () => {
    for (const purpose of ['select_food', 'poi', 'summary']) {
      const masks = new Set(
        [undefined, 'ja', 'en'].map((language) => buildDetailsRequest('ChIJx', purpose, undefined, language).fieldMask),
      )
      assert.equal(masks.size, 1, purpose)
    }
  })
})

describe('JN-C2 応答の countryCode', () => {
  const country = (shortText, types = ['country', 'political']) => ({ longText: 'x', shortText, types })
  const withComponents = (addressComponents) => ({
    types: ['cafe'],
    displayName: { text: 'Cafe', languageCode: 'en' },
    location: { latitude: 35, longitude: 139 },
    formattedAddress: '東京',
    addressComponents,
  })
  const usedPurposes = ['select_food', 'poi', 'summary']

  it('国の部品の shortText が JP → JP・US → US(3 用途とも)', () => {
    for (const purpose of usedPurposes) {
      for (const code of ['JP', 'US']) {
        const read = readDetailsResponse(
          purpose,
          withComponents([{ longText: '1-2-3', shortText: '1-2-3', types: ['street_number'] }, country(code)]),
          isFoodPlaceType,
        )
        assert.equal(read.countryCode, code, `${purpose} ${code}`)
      }
    }
  })

  it('国の部品が無い・jp・JPN・数・addressComponents が配列でない・無い → null', () => {
    const bad = [
      [{ longText: 'x', shortText: 'x', types: ['locality'] }],
      [country('jp')],
      [country('JPN')],
      [country(81)],
      [{ shortText: 'JP', types: 'country' }],
      [{ shortText: 'JP' }],
      [],
      'JP',
      { 0: country('JP') },
      null,
      undefined,
    ]
    for (const purpose of usedPurposes) {
      for (const components of bad) {
        assert.equal(
          readDetailsResponse(purpose, withComponents(components), isFoodPlaceType).countryCode,
          null,
          `${purpose} ${JSON.stringify(components)}`,
        )
      }
    }
  })

  it('3 用途の応答の鍵に addressComponents が無い(番地や郵便番号の部品が混ざっていても、足される鍵は countryCode だけ)', () => {
    const components = [
      { longText: '1', shortText: '1', types: ['street_number'] },
      { longText: '100-0001', shortText: '100-0001', types: ['postal_code'] },
      country('JP'),
    ]
    for (const purpose of usedPurposes) {
      const read = readDetailsResponse(purpose, withComponents(components), isFoodPlaceType)
      assert.ok(!('addressComponents' in read), purpose)
      assert.ok('countryCode' in read, purpose)
      assert.ok(!JSON.stringify(read).includes('100-0001'), `${purpose} 郵便番号を返さない`)
    }
  })

  it('select_location・enterprise・name_ja・poi(飲食でない)の応答に countryCode が無い', () => {
    const json = { ...withComponents([country('JP')]), viewport: { low: { latitude: 1, longitude: 2 }, high: { latitude: 3, longitude: 4 } } }
    for (const purpose of ['select_location', 'enterprise', 'name_ja']) {
      assert.ok(!('countryCode' in readDetailsResponse(purpose, json, isFoodPlaceType)), purpose)
    }
    assert.ok(!('countryCode' in readDetailsResponse('poi', { ...json, types: ['park'] }, isFoodPlaceType)))
  })
})
