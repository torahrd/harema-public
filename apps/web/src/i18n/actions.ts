'use server'

import { cookies } from 'next/headers'
import { hasAgreedToCurrent } from '@/lib/auth/consent-notice'
import { createUserSupabase, getVerifiedUser, isSecureCookie } from '@/lib/auth/session'
import { LOCALE_COOKIE_NAME, localeCookieAttributes, localeCookieWritable } from './locale-cookie'
import { setLocaleIfAgreed } from './set-locale-core'

/**
 * 表示言語を選ぶ(ログイン後の画面の言語の切り替え・地図のメニュー)。判定の核は set-locale-core.ts(テストが読む)。
 * 言語の cookie はポリシーの 2026.11.20 の改定で足した取得の情報なので、今の改定に同意した人にだけ書く(所有者 2026-11-21)。
 * 書くのは、(1) 値が許可リスト(localeSchema)に当たる・(2) 適用の日時以後(サーバの時刻)・(3) 検証済みのログイン(getVerifiedUser)・(4) DB の current_agreement() の agreed が true、の 4 つがそろった時だけ。
 * どれかが欠ければ { ok: false }(投げない・cookie に触れない)。クライアントからは言語の値だけを受け、ID もバージョンも受けない。行き先を受けず、転送もしない。
 * ログイン前の訪問者はここを書けない(ログイン画面の切り替えはクエリで表示だけ変え、cookie はログインの受付が同意の記録の後に書く)。
 * 応答は Next.js が no-store で返す。描き直しは呼ぶ側(lang-switch.tsx)が決める。
 */
export async function setLocale(input: unknown): Promise<{ ok: boolean }> {
  return setLocaleIfAgreed(input, {
    writable: () => localeCookieWritable(),
    hasVerifiedUser: async () => (await getVerifiedUser()) !== null,
    hasAgreedToCurrent: async () => hasAgreedToCurrent(await createUserSupabase()),
    write: async (locale) => {
      const store = await cookies()
      store.set(LOCALE_COOKIE_NAME, locale, localeCookieAttributes(isSecureCookie()))
    },
  })
}
