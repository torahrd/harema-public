import { z } from 'zod'
import { SHARE_QUERY_MAX_LENGTH, SOURCE_TEXT_MAX_LENGTH } from '../constants'
import { codePointLength } from './char-length'
import { sourceUrlSchema } from './saved-place'

/**
 * 共有の拡張(Share Extension)が本体へ渡す中身。App Group の Keychain に 1 項目として書き、URL には載せない
 * (`harema://` は他のアプリ・サイトからも開けるので、URL に載せると外の者が検索欄と出典へ任意の文字を入れさせられる)。
 */

/** この時間より古い渡しは捨てる(開きそびれた共有が、何日も後に急に検索を開かないように)。 */
export const SHARE_HANDOFF_TTL_MS = 10 * 60 * 1000

/** 端末の時計のずれの許容。これより先の時刻の渡しは捨てる。 */
export const SHARE_HANDOFF_FUTURE_SKEW_MS = 60 * 1000

export const shareHandoffSchema = z.object({
  v: z.literal(1),
  query: z.string().refine((value) => codePointLength(value) <= SHARE_QUERY_MAX_LENGTH),
  /** 出典に入れる URL(http(s)・userinfo なし・1000 字まで)か、無ければ null。 */
  sourceText: sourceUrlSchema.refine((value) => codePointLength(value) <= SOURCE_TEXT_MAX_LENGTH).nullable(),
  /** 書いた時刻(エポックのミリ秒)。 */
  createdAt: z.number().int().nonnegative(),
})

export type ShareHandoff = z.infer<typeof shareHandoffSchema>
