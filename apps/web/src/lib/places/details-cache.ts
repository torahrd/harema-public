'use client'

import { PLACE_DETAILS_MEMORY_TTL_MS } from '@harema/shared/constants'
import type { JapaneseNameResult } from '@harema/shared/ja-name'

/**
 * 表示用 Place Details のクライアントメモリキャッシュ(spec §4.3)。
 *
 * **`fetchFields` を呼ぶのはこのモジュールの `fetchInto` と `getJapaneseDisplayName` の 2 か所だけ**で、
 * 要求できるフィールドは下の union に閉じてある(spec §4.2 の帯表に載っているものだけ)。散らばった fetchFields は Field Mask を
 * 散らし、1 フィールドの追加で課金帯が跳ねる —— 入口をこの 2 か所に限ることが最小化の構造担保になる。
 *
 * REST 版の `fields` パラメータでは末尾 2 文字が小文字の綴りだが、この SDK(`@types/google.maps`)
 * の実際のプロパティ名・要求できる文字列は末尾が大文字の `websiteURI` である。`fetchFields` の
 * `fields` パラメータの型は `Iterable<string>` で渡す文字列の綴りを型では縛らないため、この
 * 1 文字の食い違いは TypeScript の型検査を素通りする。誤った綴りが実行時に `fetchFields` の
 * 境界を越えると Google 側がリクエスト全体を reject し、同じマスクに含まれる他のフィールド
 * (営業時間・電話)も一緒に失敗する。だから下の型の従属で union を SDK 側のキー集合に縛る。
 *
 * 保持はメモリのみ。`localStorage` 等へ逃がさない(spec §4.1 の保存制限 / §4.3 の逐語)。
 * 取得した値(店名・住所・types)は表示のためだけに持ち、サーバ・DB へ送らない。
 */

/** 要求できるフィールド。spec §4.2 の帯表に載っているものだけを型で許す。 */
export type PlaceDetailsField =
  | 'location'
  | 'displayName'
  | 'formattedAddress'
  | 'types'
  | 'viewport'
  | 'addressComponents'
  | 'regularOpeningHours'
  | 'nationalPhoneNumber'
  | 'websiteURI'

type AssertExtends<U, T extends U> = T
/** `PlaceDetailsField` が `google.maps.places.Place` のキー集合の部分集合であることを
 *  コンパイル時に強制する(WP-10.5 D4 の検出力の担保)。実行時には現れない。 */
export type PlaceDetailsFieldWithinPlaceKeys = AssertExtends<
  keyof google.maps.places.Place,
  PlaceDetailsField
>

type CacheEntry = {
  place: google.maps.places.Place
  /** この Place インスタンスが既に取得済みのフィールド。 */
  fetched: Set<PlaceDetailsField>
  expiresAt: number
}

/** 上限。長時間開きっぱなしのタブで Map が無制限に伸びるのを避ける。 */
const MAX_ENTRIES = 100

/** place_id → エントリ。挿入順を保つので、追い出しは先頭から取れる。 */
const entries = new Map<string, CacheEntry>()

function sweep(now: number): void {
  for (const [placeId, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(placeId)
  }
}

/** 期限切れを掃いてから、なお溢れる分を挿入順(古い順)に落とす。 */
function evict(now: number): void {
  sweep(now)
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next()
    if (oldest.done) return
    entries.delete(oldest.value)
  }
}

/**
 * 表示用の fetchFields 呼び出し口(もう 1 つは日本語の店名の `getJapaneseDisplayName`)。成功したときだけキャッシュへ反映する ——
 * 失敗をエントリにすると、次の操作までの TTL 分だけ「取れない店」が固定される。
 */
async function fetchInto(
  place: google.maps.places.Place,
  fields: readonly PlaceDetailsField[],
  known: Set<PlaceDetailsField>,
): Promise<google.maps.places.Place> {
  await place.fetchFields({ fields })
  const fetched = new Set(known)
  for (const field of fields) fetched.add(field)
  const now = Date.now()
  entries.set(place.id, {
    place,
    fetched,
    expiresAt: now + PLACE_DETAILS_MEMORY_TTL_MS,
  })
  evict(now)
  return place
}

/**
 * キャッシュ読み書きの入口。TTL 内のエントリが要求フィールドをすべて持っていれば、
 * **ネットワークに触れずに**その Place を返す(= 同じ店の再表示が無課金になる)。
 *
 * **Autocomplete の選択確定からは呼ばない** —— セッションは Details 呼び出しで閉じるので、
 * キャッシュから返すと閉じないセッションが生まれ、候補側が課金対象に落ちうる(spec §4.3)。
 * その経路は `fetchPlaceFields` を使う。
 */
export async function getPlaceDetails(
  placesLibrary: google.maps.PlacesLibrary,
  placeId: string,
  fields: readonly PlaceDetailsField[],
): Promise<google.maps.places.Place> {
  const now = Date.now()
  const cached = entries.get(placeId)
  if (cached && cached.expiresAt > now) {
    if (fields.every((field) => cached.fetched.has(field))) return cached.place
    return fetchInto(cached.place, fields, cached.fetched)
  }
  if (cached) entries.delete(placeId)
  return fetchInto(new placesLibrary.Place({ id: placeId }), fields, new Set())
}

/**
 * 呼び出し側が持っている Place に対して取得し、結果をキャッシュへ**書くだけ**の入口
 * (読まない)。Autocomplete の `prediction.toPlace()` 経路専用。
 */
export async function fetchPlaceFields(
  place: google.maps.places.Place,
  fields: readonly PlaceDetailsField[],
): Promise<google.maps.places.Place> {
  const cached = entries.get(place.id)
  const known =
    cached && cached.place === place ? cached.fetched : new Set<PlaceDetailsField>()
  return fetchInto(place, fields, known)
}

// ── 英語の画面の日本語の店名(harema#219)────────────────────────────────────────

/** 日本語の店名で要求するフィールド。項目を足すと、型(`PlaceDetailsField`)が止める。帯は Pro のまま。 */
const JA_NAME_FIELDS = ['displayName'] as const satisfies readonly PlaceDetailsField[]

type JapaneseNameEntry = { value: JapaneseNameResult; expiresAt: number }

/**
 * place_id → 日本語の店名(Google が返した名前と言語そのもの)。表示言語の `entries` には**書かない**
 * (書くと、一覧・シートの英語名が日本語に入れ替わる)。同じ 10 分・同じ上限。
 */
const japaneseNames = new Map<string, JapaneseNameEntry>()

function evictJapaneseNames(now: number): void {
  for (const [placeId, entry] of japaneseNames) {
    if (entry.expiresAt <= now) japaneseNames.delete(placeId)
  }
  while (japaneseNames.size > MAX_ENTRIES) {
    const oldest = japaneseNames.keys().next()
    if (oldest.done) return
    japaneseNames.delete(oldest.value)
  }
}

/**
 * 日本語の店名(`displayName` だけ・言語 `ja`)を取る。TTL 内の 2 回目は取得しない。
 * 失敗はキャッシュしない(投げる)。表示言語の `entries` の `Place` とは別の `Place` で取る。
 * 「英語名と同じか」「日本語か」の判断はここでしない(呼ぶ側の `resolveJapaneseName`)。
 */
export async function getJapaneseDisplayName(
  placesLibrary: google.maps.PlacesLibrary,
  placeId: string,
): Promise<JapaneseNameResult> {
  const now = Date.now()
  const cached = japaneseNames.get(placeId)
  if (cached && cached.expiresAt > now) return cached.value
  if (cached) japaneseNames.delete(placeId)
  const place = new placesLibrary.Place({ id: placeId, requestedLanguage: 'ja' })
  await place.fetchFields({ fields: JA_NAME_FIELDS })
  const value: JapaneseNameResult = {
    displayName: place.displayName ?? '',
    displayNameLanguageCode: place.displayNameLanguageCode ?? null,
  }
  const fetchedAt = Date.now()
  japaneseNames.set(placeId, { value, expiresAt: fetchedAt + PLACE_DETAILS_MEMORY_TTL_MS })
  evictJapaneseNames(fetchedAt)
  return value
}
