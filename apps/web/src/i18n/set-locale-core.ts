import { localeSchema, type Locale } from '@harema/shared/i18n'

/**
 * 言語の cookie を書いてよいかの判定の核(setLocale = i18n/actions.ts が本物の依存を渡す)。
 * `next` を import しない純粋な部品で、node の単体テストが読む。
 *
 * 言語の cookie はポリシーの 2026.11.20 の改定で足した取得の情報なので、今の改定に同意した人にだけ書く(所有者 2026-11-21)。
 * 書くのは、値が許可リストに当たり・適用の日時以後で・検証済みのログインがあり・DB が今のバージョンに同意済みと答えた時だけ。
 * どれかが欠ける・依存が投げる時は、書かずに `{ ok: false }`(判定は安いものから順に。書く直前まで cookie に触れない)。
 */
export type SetLocaleDeps = {
  /** 適用の日時以後か(サーバの時刻)。 */
  writable: () => boolean
  /** 署名・iss・aud・期限を検証したログインがあるか(getVerifiedUser)。 */
  hasVerifiedUser: () => Promise<boolean>
  /** DB の current_agreement() の agreed(本人の行だけ)。失敗は false。 */
  hasAgreedToCurrent: () => Promise<boolean>
  /** cookie を書く(決めた属性は呼ぶ側)。 */
  write: (locale: Locale) => Promise<void> | void
}

export async function setLocaleIfAgreed(input: unknown, deps: SetLocaleDeps): Promise<{ ok: boolean }> {
  const parsed = localeSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  if (!deps.writable()) return { ok: false }
  try {
    if (!(await deps.hasVerifiedUser())) return { ok: false }
    if (!(await deps.hasAgreedToCurrent())) return { ok: false }
  } catch {
    return { ok: false }
  }
  await deps.write(parsed.data)
  return { ok: true }
}
