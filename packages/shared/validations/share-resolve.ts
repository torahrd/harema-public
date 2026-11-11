import { z } from 'zod'
import { SHARE_QUERY_MAX_LENGTH, SOURCE_TEXT_MAX_LENGTH } from '../constants'
import { codePointLength } from './char-length'

/**
 * 共有の Google マップの短い URL をたどって店名を得る受け口(`/api/mobile/v1/share/resolve`)。
 * 本文は `url` だけ。たどってよい URL かどうかの判定(`mapsShortUrlId`)は受け口の核が行う。
 */
export const shareResolveRequestSchema = z.object({
  url: z.string().refine((value) => codePointLength(value) <= SOURCE_TEXT_MAX_LENGTH),
})

export type ShareResolveRequest = z.output<typeof shareResolveRequestSchema>

export const shareResolveResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    query: z.string().refine((value) => {
      const length = codePointLength(value)
      return length >= 1 && length <= SHARE_QUERY_MAX_LENGTH
    }),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not_maps_short_url', 'unavailable']),
  }),
])

export type ShareResolveResponse = z.output<typeof shareResolveResponseSchema>
