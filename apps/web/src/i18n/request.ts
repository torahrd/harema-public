import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { messages } from '@harema/shared/i18n'
import { ENABLED_LOCALES } from './config'
import { LOCALE_COOKIE_NAME, resolveLocale } from './locale-cookie'

// アプリの画面の言語は、選んだ言語の cookie → Accept-Language → ja の順で決める(URL には入れない)。
// cookie の値は許可リストに当たる時だけ使い、返すのは定数だけ(resolveLocale)。
// 公開ページ((site))はこの設定を読まない。読むと静的でなくなる。
export default getRequestConfig(async () => {
  const cookieValue = (await cookies()).get(LOCALE_COOKIE_NAME)?.value
  const acceptLanguage = (await headers()).get('accept-language')
  const locale = resolveLocale(cookieValue, acceptLanguage, ENABLED_LOCALES)
  return { locale, messages: messages[locale] }
})
