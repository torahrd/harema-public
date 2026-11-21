import { isLegalEffective } from '@harema/shared/constants'
import { localeSchema, matchLocale, parseAcceptLanguage, type Locale } from '@harema/shared/i18n'

/**
 * 選んだ言語を端末に覚えさせる cookie の名前と属性。名前を書く・読む道は決めた所だけ
 * (書くのは i18n/actions.ts〔ログインしていて今の改定に同意した人だけ〕と、ログインの受付が呼ぶ refreshLocaleCookie〔同意の記録に成功した時だけ〕・読むのは i18n/request.ts と refreshLocaleCookie。ほかの所はこの定数で指す。テストが守る)。
 * `next` を import しない純粋な部品で、node の単体テストが読む。
 * 認可・ログインの状態には使わない。値は ja・en だけで、利用者の情報を持たない(計画 12.3)。
 */
export const LOCALE_COOKIE_NAME = 'harema_locale'

/** 1 年(秒)。選び直した時と、ログインを受け付けた時(refreshLocaleCookie)に書き直す。 */
const ONE_YEAR_SECONDS = 31_536_000

/** `domain` は付けない(サブドメインへ送らない)。`secure` は https の時だけ true(判定は呼ぶ側)。 */
export function localeCookieAttributes(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
    maxAge: ONE_YEAR_SECONDS,
  }
}

/**
 * 表示言語を決める: cookie の値が許可リストに当たり、有効な言語ならその値。
 * 当たらなければ Accept-Language(matchLocale)、それも無ければ ja。
 * cookie の値は比べるだけで、返すのは LOCALES の定数だけ(値を画面に出さない)。
 */
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null,
  enabled: readonly Locale[],
): Locale {
  const parsed = localeSchema.safeParse(cookieValue)
  if (parsed.success && enabled.includes(parsed.data)) return parsed.data
  return matchLocale(parseAcceptLanguage(acceptLanguage), enabled)
}

/**
 * ログイン画面の `?lang=` の値を、許可リスト(localeSchema)で確かめる。当たらない値・複数・無しは null。
 * 画面の表示言語を替えるだけに使い、cookie は書かない(cookie はログインの受付が、同意の記録に成功した時だけ書く)。
 */
export function parseLoginLang(value: unknown): Locale | null {
  const parsed = localeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * 言語の cookie を書いてよい時か(適用の日時 `LEGAL_EFFECTIVE_AT` 以後)。ポリシーの改定(言語の Cookie の説明の追加)の適用の前は書かない。
 * 時刻はサーバの時刻(引数で渡せる形・既定は今)。cookie を読む側(request.ts)は変えない(Accept-Language で英語は出る)。
 */
export function localeCookieWritable(now: number = Date.now()): boolean {
  return isLegalEffective(now)
}

/**
 * ログインを受け付けた応答で、言語の cookie を書く(所有者の決定 2026-11-16・harema#150 案 A の延長。2026-11-21 に同意の条件を足した)。
 * 言語の cookie はポリシーの 2026.11.20 の改定で足した取得の情報なので、今の改定に同意した人にだけ書く。
 * `agreed` は、受付が同意の記録に成功した(recorded か already)時だけ true。それ以外(記録の失敗・目印が無い)は何も書かない。
 * 書く値は、(1) ログイン画面で選んだ言語(`chosen`・Zod で確かめ済みの値だけ)・(2) 無ければ、端末の cookie の値(許可リストに当たる時だけ。期限を 1 年に延ばす)。
 * どちらも無ければ何も書かない(言語を決めない)。適用の日時より前も何も書かない。
 * 名前はこの部品の中だけで扱う(呼ぶ側は名前を知らない)。
 */
export function refreshLocaleCookie(
  request: { cookies: { get(name: string): { value: string } | undefined } },
  response: { cookies: { set(name: string, value: string, attributes: ReturnType<typeof localeCookieAttributes>): unknown } },
  secure: boolean,
  login: { agreed: boolean; chosen: Locale | null },
  now: number = Date.now(),
): void {
  if (!login.agreed) return
  if (!localeCookieWritable(now)) return
  const existing = localeSchema.safeParse(request.cookies.get(LOCALE_COOKIE_NAME)?.value)
  const value = login.chosen ?? (existing.success ? existing.data : null)
  if (value === null) return
  response.cookies.set(LOCALE_COOKIE_NAME, value, localeCookieAttributes(secure))
}
