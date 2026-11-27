'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useLocale } from 'next-intl'
import {
  createJapaneseNameRequest,
  japaneseNameStateFor,
  resolveJapaneseName,
  shouldOfferJapaneseName,
  type JapaneseNameRequest,
  type JapaneseNameState,
} from '@harema/shared/ja-name'
import { getJapaneseDisplayName } from '@/lib/places/details-cache'

/** 札を置くかを決める元の店(1 回目の取得で分かっている値)。 */
export type JapaneseNameSource = {
  googlePlaceId: string
  displayName: string
  /** 1 回目の店名の言語(返らない時は null か undefined)。 */
  displayNameLanguageCode?: string | null
  /** 店の国(1 回目の `addressComponents` から。分からない時は null か undefined = 札を置かない)。 */
  countryCode?: string | null
}

/** hook が返す物。`reveal` は札を押した時に呼ぶ(`chip` の時だけ動く)。 */
export type JapaneseNameView = JapaneseNameState & { reveal: () => void }

/**
 * 英語の画面の日本語の店名の札(harema#219)。表示ごとに、前の店の応答を捨てる(`createJapaneseNameRequest`)。
 * `source` が null の間は何もしない(閉じている・1 回目の取得がまだ)。**開いた時には取らない**: effect は札を置く(`offer`)だけで、
 * 取得は `reveal`(札を押した時)の中の 1 か所だけ。返す形は `{ phase, text, error, reveal }`。
 * 一覧・検索の候補・削除の確認・「Google マップで開く」は、この値を使わない。
 */
export function useJapaneseName(
  places: google.maps.PlacesLibrary | null | undefined,
  source: JapaneseNameSource | null,
): JapaneseNameView {
  const locale = useLocale()
  const [request] = useState<JapaneseNameRequest>(createJapaneseNameRequest)
  const snapshot = useSyncExternalStore(request.subscribe, request.snapshot, request.snapshot)

  const placeId = source?.googlePlaceId ?? null
  const displayName = source?.displayName ?? ''
  const displayNameLanguageCode = source?.displayNameLanguageCode ?? null
  const countryCode = source?.countryCode ?? null
  const eligible =
    placeId !== null &&
    shouldOfferJapaneseName({ locale, displayName, displayNameLanguageCode, countryCode })

  useEffect(() => {
    if (placeId === null) {
      request.reset()
      return
    }
    request.offer(placeId, eligible)
  }, [request, placeId, eligible])

  const reveal = useCallback(() => {
    if (!places || placeId === null) return
    request.reveal(() =>
      resolveJapaneseName({ locale, displayName, displayNameLanguageCode, countryCode }, () =>
        getJapaneseDisplayName(places, placeId),
      ),
    )
  }, [request, places, placeId, locale, displayName, displayNameLanguageCode, countryCode])

  const state = useMemo(
    () => japaneseNameStateFor(eligible, snapshot, placeId),
    [eligible, snapshot, placeId],
  )
  return useMemo(() => ({ ...state, reveal }), [state, reveal])
}
