import { LEGAL_REVISIONS } from '@harema/shared/constants'
import { privacy, privacyEn, privacyPosting, privacyPostingEn, type LegalDocument } from './legal'

/**
 * プライバシーポリシーの本文を、サーバの時刻で選ぶ(掲示の間の本文 → 効力発生の後の本文。デプロイも再起動も要らない)。
 *
 * - 効力発生の日時: `LEGAL_REVISIONS.privacy` の最後の行(最新の改定)の `effectiveAt`。DB の `private.legal_revisions` と同じ瞬間
 *   (DB の改定の行・shared の一覧・この切り替えが同じ日時であることは、T-9 と legal-switch.test.mjs が見る)。
 * - 掲示の間の本文: `docs/legal/posting/privacy.md`(`privacyPosting`・`privacyPostingEn`)。冒頭に改定のお知らせと最終改定日 2026.11.22。
 * - 効力発生の後の本文: `docs/legal/privacy.md`(`privacy`・`privacyEn`)。最終改定日 2026.11.29。
 * - 呼ぶ側は `await connection()` の後に `Date.now()` を渡す(静的に作った頁だと、作った時刻の値が固まって 0 時に切り替わらない)。
 * - 次の改定の掲示を足すときは、その掲示の本文を posting に置き直し、最新の改定の行を足す。切り替えは最新の行の日時を見る。
 */
export function privacyEffectiveAt(): string {
  const latest = LEGAL_REVISIONS.privacy[LEGAL_REVISIONS.privacy.length - 1]
  if (!latest) throw new Error('LEGAL_REVISIONS.privacy is empty')
  return latest.effectiveAt
}

/** 効力発生の日時の瞬間を含めて、それ以後か(`>=`)。 */
export function isPrivacyEffective(now: number): boolean {
  return now >= Date.parse(privacyEffectiveAt())
}

/** `now`(`Date.now()` の値)での、言語ごとのプライバシーポリシーの本文。 */
export function privacyDocument(locale: 'ja' | 'en', now: number): LegalDocument {
  if (isPrivacyEffective(now)) return locale === 'en' ? privacyEn : privacy
  return locale === 'en' ? privacyPostingEn : privacyPosting
}
