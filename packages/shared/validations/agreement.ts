import { z } from 'zod'

/**
 * ログインの画面を経た目印。`POST /auth/session` の本文の `agreed`(`true` だけが目印)。
 * 同意した番号は本文に載せない。記録する番号は DB の `record_agreement()` が決める(呼ぶ側は番号も日時も渡さない)。
 * 目印もログインの画面の申告で、サーバは画面を経たことを確かめられない(docs/specification.md §6.1 の限界と同じ)。
 */
export const agreedMarkSchema = z.literal(true)

/**
 * `agreement_state()`(DB の関数)が返す 1 行の形。web と mobile が同じ形で読む(サーバとクライアントで同じスキーマ)。
 * `notice_*` は `notice_due` が真の時だけ値を持つ(偽なら null)。文の中の `{date}` は `notice_effective_on` で埋める。
 */
export const agreementStateRowSchema = z.object({
  agreed: z.boolean(),
  notice_due: z.boolean(),
  notice_effective_on: z
    .string()
    .regex(/^\d{4}\.\d{2}\.\d{2}$/)
    .nullable(),
  notice_ja: z.array(z.string().min(1)).nullable(),
  notice_en: z.array(z.string().min(1)).nullable(),
  lists_open: z.boolean(),
})

/** 「改定のお知らせ」の文(DB の行の値。段落ごと・`{date}` は未置換)。 */
export interface AgreementNotice {
  /** 適用の日(日本標準時の暦日・`YYYY.MM.DD`)。`{date}` に入る。 */
  readonly effectiveOn: string
  readonly ja: readonly string[]
  readonly en: readonly string[]
}

/** 画面が読む同意の状態。 */
export interface AgreementState {
  /** 今のバージョンに同意済みか。 */
  readonly agreed: boolean
  /** お知らせを出すなら、その文。出さない(同意済み・失敗・文が無い)なら null。 */
  readonly notice: AgreementNotice | null
  /** リストを開いてよいか(DB の `lists_open`)。 */
  readonly listsOpen: boolean
}

/** 失敗・形の違いの時の値: 同意に未確認・お知らせを出さない・リストを開かない(閉じる側に倒す)。 */
export const CLOSED_AGREEMENT_STATE: AgreementState = { agreed: false, notice: null, listsOpen: false }

/**
 * `rpc('agreement_state')` の `data` を読む。投げない。
 * 形が違う・行が無い時は `CLOSED_AGREEMENT_STATE`。`notice_due` が真で文(日付・日本語・英語)が欠けている時は、
 * 出せるお知らせが無いので `notice: null` かつ `listsOpen: false`(お知らせを出せないまま開かない)。
 */
export function parseAgreementState(data: unknown): AgreementState {
  const row = agreementStateRowSchema.safeParse(Array.isArray(data) ? data[0] : undefined)
  if (!row.success) return CLOSED_AGREEMENT_STATE
  const r = row.data
  if (!r.notice_due) {
    return { agreed: r.agreed, notice: null, listsOpen: r.lists_open }
  }
  if (r.notice_effective_on === null || r.notice_ja === null || r.notice_en === null) {
    return { agreed: r.agreed, notice: null, listsOpen: false }
  }
  return {
    agreed: r.agreed,
    notice: { effectiveOn: r.notice_effective_on, ja: r.notice_ja, en: r.notice_en },
    listsOpen: r.lists_open,
  }
}

/** 表示言語の段落の並び。`{date}` を適用の日で埋める。英語以外は日本語。 */
export function noticeParagraphs(notice: AgreementNotice, locale: string): string[] {
  const paragraphs = locale === 'en' ? notice.en : notice.ja
  return paragraphs.map((p) => p.split('{date}').join(notice.effectiveOn))
}
