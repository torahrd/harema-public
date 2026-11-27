/**
 * 英語の画面の「日本語の店名」の純粋な関数(react・通信・DB は import しない)。web と mobile が同じ決め方を使う。
 * 出どころ: harema#219(所有者の決定 2026-11-25 15:41 の案 3 押せる札・15:47 の文言・15:53 の取れなかった時は案 B)・単位 ja-name の PLAN 2。
 *
 * 決まり:
 * - 札を置くのは、英語の画面で、日本にある店(国が `JP`)で、1 回目の店名が日本語でない店だけ。国が分からなければ置かない。
 * - 札を押した時だけ取る(開いた時には取らない)。
 * - 押した後は、名前(日本語で・1 回目と違う)・同じ・無い、の 3 つに分ける。取れなかった時は札を残して赤い字を出し、押し直せる。
 */

/** 2 回目の取得の結果(Google が返した名前と言語そのもの。キャッシュにもこの形で書く)。 */
export type JapaneseNameResult = {
  displayName: string
  displayNameLanguageCode: string | null
}

// 言語タグの形(`en`・`ja-JP`・`zh-Hant-TW`)。この形でない文字列は「言語が不明」と同じに扱う。
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i
// 先頭の部分が `ja`(`ja`・`ja-JP`・`JA`・`ja-Latn`)。
const JAPANESE_TAG = /^ja(?:-|$)/i
// 仮名(ひらがな・カタカナ・半角カタカナ)か漢字(CJK 統合漢字・拡張 A・々)を 1 字でも含む。
// 中黒「・」と長音「ー」だけでは日本語としない。
const JAPANESE_SCRIPT = /[々ぁ-ゖァ-ヺｦ-ｯｱ-ﾝ㐀-䶿一-鿿]/

function isKnownLanguageCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && LANGUAGE_TAG.test(code)
}

/** 言語タグが日本語か(先頭の部分が `ja`。大文字小文字を問わない)。タグの形でなければ false。 */
export function isJapaneseLanguageCode(code: string | null | undefined): boolean {
  return isKnownLanguageCode(code) && JAPANESE_TAG.test(code)
}

/** 名前の字に仮名か漢字が 1 字でも含まれるか。 */
export function hasJapaneseScript(text: string): boolean {
  return JAPANESE_SCRIPT.test(text)
}

/**
 * 名前が日本語か。言語が分かる時(言語タグの形)は言語で決め、
 * 言語が不明の時(null・undefined・空・形の違う値・古いサーバ)だけ、名前の字で決める。
 */
export function isJapaneseName(input: {
  text: string
  languageCode: string | null | undefined
}): boolean {
  if (isKnownLanguageCode(input.languageCode)) return isJapaneseLanguageCode(input.languageCode)
  return hasJapaneseScript(input.text)
}

// 国の部品の `shortText`(ISO 3166-1 の 2 字。大文字)
const COUNTRY_CODE = /^[A-Z]{2}$/

/**
 * Places の `addressComponents`(REST の JSON の配列でも、Maps JS の `AddressComponent` の配列でも)から、国の 2 字を読む。
 * `types` に `country` を含む部品の `shortText` が大文字 2 字の時だけ返し、それ以外(部品が無い・形が違う・小文字・3 字)は null(投げない)。
 * Maps JS の `AddressComponent` は prototype の getter で `types`・`shortText` を持つので、`c.types`・`c.shortText` を直に読む。
 * 国は札を置くかの判断だけに使う(画面に出さず保存しない)。
 */
export function countryCodeOf(components: unknown): string | null {
  if (!Array.isArray(components)) return null
  for (const component of components as unknown[]) {
    if (typeof component !== 'object' || component === null) continue
    const types: unknown = (component as { types?: unknown }).types
    if (!Array.isArray(types) || !(types as unknown[]).includes('country')) continue
    const shortText: unknown = (component as { shortText?: unknown }).shortText
    return typeof shortText === 'string' && COUNTRY_CODE.test(shortText) ? shortText : null
  }
  return null
}

export type ShouldOfferJapaneseNameInput = {
  /** 表示言語。`ja` の画面は札を置かない。 */
  locale: string
  /** 1 回目の店名。 */
  displayName: string
  /** 1 回目の店名の言語(返らない時は null か undefined)。 */
  displayNameLanguageCode: string | null | undefined
  /** 店の国(1 回目の取得の `addressComponents` から。分からない・古いサーバは null か undefined)。 */
  countryCode: string | null | undefined
}

/**
 * 札を置くか。表示言語が ja でない・店名が空でない・国が `JP`(完全一致)・1 回目の名前が日本語でない時だけ true。
 * 国が分からない(null・undefined)なら置かない(置く側に倒すと海外の店に札が出る)。
 */
export function shouldOfferJapaneseName(input: ShouldOfferJapaneseNameInput): boolean {
  if (input.locale === 'ja') return false
  if (input.displayName.trim() === '') return false
  if (input.countryCode !== 'JP') return false
  return !isJapaneseName({ text: input.displayName, languageCode: input.displayNameLanguageCode })
}

/** 押した後に出す物(失敗を除く)。`name` はその名前(前後の空白を除く)・`same` = 1 回目と同じ・`none` = 日本語の店名が無い。 */
export type JapaneseNameOutcome =
  | { kind: 'name'; text: string }
  | { kind: 'same' }
  | { kind: 'none' }

/** 押した後の結果。`failed` = 取れなかった(札を残して赤い字を出す)。 */
export type JapaneseNameResolution = JapaneseNameOutcome | { kind: 'failed' }

/**
 * 2 回目の結果を 3 つに分ける。判定の順: 空 → `none` / 1 回目と(前後の空白を除いて)同じ → `same` / 日本語でない → `none` / ほか → `name`。
 * 日本語でない同じ名前(「Tempura」と「Tempura」)は `same`。
 */
export function japaneseNameOutcome(displayName: string, second: JapaneseNameResult): JapaneseNameOutcome {
  const text = second.displayName.trim()
  if (text === '') return { kind: 'none' }
  if (text === displayName.trim()) return { kind: 'same' }
  if (!isJapaneseName({ text, languageCode: second.displayNameLanguageCode })) return { kind: 'none' }
  return { kind: 'name', text }
}

/**
 * 条件の判定 → 取得 → 結果、を 1 か所にまとめる。条件に合わない入力は取得 0 回で null。
 * 取得が投げる・null を返す時は `{ kind: 'failed' }`(投げない)。
 */
export async function resolveJapaneseName(
  input: ShouldOfferJapaneseNameInput,
  fetchName: () => Promise<JapaneseNameResult | null>,
): Promise<JapaneseNameResolution | null> {
  if (!shouldOfferJapaneseName(input)) return null
  let second: JapaneseNameResult | null
  try {
    second = await fetchName()
  } catch {
    return { kind: 'failed' }
  }
  if (second === null) return { kind: 'failed' }
  return japaneseNameOutcome(input.displayName, second)
}

/**
 * 日本語の店名の表示の段階。
 * `hidden` = 条件に合わない(何も描かない)/ `chip` = 札 / `loading` = 押した後・届くまで(灰色の棒)/ `name`・`same`・`none` = 結果。
 * 失敗は `chip` に戻し、`error` を true にする(札の下に赤い字)。
 */
export type JapaneseNamePhase = 'hidden' | 'chip' | 'loading' | 'name' | 'same' | 'none'

export type JapaneseNameState = {
  phase: JapaneseNamePhase
  /** `phase` が `name` の時だけその名前。ほかは null。 */
  text: string | null
  /** 取れなかった(札の下に赤い字を出す)。 */
  error: boolean
}

export type JapaneseNameSnapshot = JapaneseNameState & { placeId: string | null }

export type JapaneseNameRequest = {
  /**
   * `placeId` の表示を始める(取得はしない)。`eligible` なら `chip`・そうでなければ `hidden`。
   * 違う `placeId` に替わると、前の `placeId` の応答は捨て、`error` も false に戻す。
   * 同じ `placeId` の呼び出しは、`hidden` と `chip` の間だけ `eligible` に合わせて直す(取得中・結果は動かさない)。
   */
  offer(placeId: string, eligible: boolean): void
  /**
   * 札を押した。`chip` の時だけ動く(`loading`・結果・`hidden` では何もしない = 同じ表示で二重に取らない)。
   * **呼んだその時に** `error` を false にして `loading` にし、`run` を呼ぶ。結果が `failed`・`run` が投げた時は `chip` に戻して `error` を true にする。
   * `run` が null(条件が変わって合わなくなった)なら `hidden`。違う店に替わった後の応答は捨てる。動いたら true。
   */
  reveal(run: () => Promise<JapaneseNameResolution | null>): boolean
  /** 表示を閉じる。前の応答は捨て、同じ `placeId` をもう一度 `offer` できる。 */
  reset(): void
  /** 今の状態の写し(変わるまで同じ object。`useSyncExternalStore` 用)。 */
  snapshot(): JapaneseNameSnapshot
  /** 状態が変わった時に呼ぶ。外すには戻り値を呼ぶ。 */
  subscribe(listener: () => void): () => void
}

const HIDDEN: JapaneseNameState = { phase: 'hidden', text: null, error: false }
const CHIP: JapaneseNameState = { phase: 'chip', text: null, error: false }

/**
 * hook が返す状態を決める(純粋な関数)。web と mobile の hook が同じ判定を使う。
 * - 店が無い(`placeId` が null)なら `hidden`。
 * - snapshot の店(`snapshot.placeId`)が今の店(`placeId`)と違う間は、前の店の結果を出さず、`eligible` なら `chip`・そうでなければ `hidden`。
 * - 同じ店なら snapshot の値。
 */
export function japaneseNameStateFor(
  eligible: boolean,
  snapshot: JapaneseNameSnapshot,
  placeId: string | null,
): JapaneseNameState {
  if (placeId === null) return HIDDEN
  if (snapshot.placeId !== placeId) return eligible ? CHIP : HIDDEN
  return { phase: snapshot.phase, text: snapshot.text, error: snapshot.error }
}

/**
 * 日本語の店名の表示を、表示ごとに 1 回だけ・前の店の応答を捨てて持つための入れ物。
 * web と mobile の hook が使う(hook が返す形は `{ phase, text, error, reveal }`)。
 */
export function createJapaneseNameRequest(): JapaneseNameRequest {
  let current: JapaneseNameSnapshot = { placeId: null, ...HIDDEN }
  // 店が替わる・閉じる・押すたびに進める。前の応答は、進んだ後に届いたら捨てる
  let serial = 0
  const listeners = new Set<() => void>()

  const publish = (next: JapaneseNameSnapshot): void => {
    current = next
    for (const listener of [...listeners]) listener()
  }

  return {
    offer(placeId, eligible) {
      if (current.placeId === placeId) {
        if (current.phase === 'hidden' && eligible) {
          publish({ placeId, ...CHIP })
        } else if (current.phase === 'chip' && !eligible) {
          publish({ placeId, ...HIDDEN })
        }
        return
      }
      serial += 1
      publish({ placeId, ...(eligible ? CHIP : HIDDEN) })
    },
    reveal(run) {
      const placeId = current.placeId
      if (placeId === null || current.phase !== 'chip') return false
      serial += 1
      const mine = serial
      publish({ placeId, phase: 'loading', text: null, error: false })
      const settle = (resolution: JapaneseNameResolution | null): void => {
        // 違う店の表示に替わった後・閉じた後の応答は捨てる
        if (serial !== mine || current.placeId !== placeId) return
        if (resolution === null) {
          publish({ placeId, ...HIDDEN })
        } else if (resolution.kind === 'failed') {
          publish({ placeId, phase: 'chip', text: null, error: true })
        } else if (resolution.kind === 'name') {
          publish({ placeId, phase: 'name', text: resolution.text, error: false })
        } else {
          publish({ placeId, phase: resolution.kind, text: null, error: false })
        }
      }
      let promise: Promise<JapaneseNameResolution | null>
      try {
        promise = run()
      } catch {
        settle({ kind: 'failed' })
        return true
      }
      promise.then(settle, () => settle({ kind: 'failed' }))
      return true
    },
    reset() {
      serial += 1
      if (current.placeId === null) return
      publish({ placeId: null, ...HIDDEN })
    },
    snapshot() {
      return current
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
