/** 改定の 1 行。DB の `private.legal_revisions` の 1 行の写し。 */
export interface LegalRevision {
  /** 文書ごとの通し番号(初版 = 1)。DB の `user_agreements.agreed_terms_version` / `agreed_privacy_version` に入る値。 */
  readonly version: number
  /** 頁の最終改定日(`YYYY.MM.DD`)。 */
  readonly revisedOn: string
  /** 適用の日時(UTC の ISO 文字列)。DB の今の番号は、適用の日時が now() 以前の最大の番号。 */
  readonly effectiveAt: string
  /** この改定で、既に登録した人に改定のお知らせを出すか。 */
  readonly notice: boolean
}

/**
 * 規約・ポリシーの改定の一覧(番号と最終改定日・適用の日時・お知らせの要否の対応)。DB の `private.legal_revisions` の写し。
 *
 * 正本は DB の一覧(migration の `insert into private.legal_revisions`)。ここは web と mobile が使う写しで、手で写す。
 * 照合: `apps/mobile/src/auth/test/legal-versions.test.mjs`(CI の mobile unit で走る)が、全ての migration の行と同じであること・
 * 頁の `最終改定日`(`apps/web/src/app/_public/legal.ts` の `revisedOn`)が一覧のどれかの `revisedOn` であることを見る。
 * 番号は頁に出さない。同意した番号の記録は DB が決める(呼ぶ側は番号を渡さない)ので、web・mobile がこの一覧から番号を送ることは無い。
 *
 * 改定を足す時: 新しい migration で一覧に 1 行足し、ここにも同じ 1 行を足す(その文書の番号を 1 つ足す)。
 * お知らせの文は、`builtin_text` が偽の行なら DB の行(`notice_ja`・`notice_en`)に持つ。ここ(web・mobile)には写さない。
 */
export const LEGAL_REVISIONS: { readonly terms: readonly LegalRevision[]; readonly privacy: readonly LegalRevision[] } = {
  terms: [{ version: 1, revisedOn: '2026.11.05', effectiveAt: '2026-11-04T15:00:00Z', notice: false }],
  privacy: [
    { version: 1, revisedOn: '2026.11.05', effectiveAt: '2026-11-04T15:00:00Z', notice: false },
    { version: 2, revisedOn: '2026.11.20', effectiveAt: '2026-11-19T15:00:00Z', notice: true },
    { version: 3, revisedOn: '2026.11.22', effectiveAt: '2026-11-21T15:00:00Z', notice: true },
    { version: 4, revisedOn: '2026.11.29', effectiveAt: '2026-11-28T15:00:00Z', notice: true },
  ],
}

/**
 * 言語の cookie を書いてよい日時(UTC の ISO 文字列)。ポリシー 3(最終改定日 2026.11.22・言語の Cookie の説明を足した改定)の適用の日時
 * (JST の 2026-11-22 0 時 = 2026-11-21T15:00:00Z)と同じ値(照合のテストが見る)。
 * 言語の cookie を書く 2 つの道(`setLocale`・`refreshLocaleCookie`)の門で、サーバの時刻がこの日時より前は書かない。
 * 最新の改定とは切り離してある(以後の改定の行を足しても、この値は変えない。変えると、掲示の間に言語の切り替えの部品が消える)。
 * お知らせの本文の日付は、DB の `agreement_state()` の `notice_effective_on`(行の `effective_at` の 1 か所)から出す。
 */
export const LOCALE_COOKIE_EFFECTIVE_AT = '2026-11-21T15:00:00Z'

/** `LOCALE_COOKIE_EFFECTIVE_AT` 以後か(サーバの時刻で決める。端末の時計に頼らない)。 */
export function isLocaleCookieEffective(now: number = Date.now()): boolean {
  return now >= Date.parse(LOCALE_COOKIE_EFFECTIVE_AT)
}
