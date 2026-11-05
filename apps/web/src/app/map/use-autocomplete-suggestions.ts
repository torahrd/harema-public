'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { classifySuggestions } from './classify-suggestions'
import {
  SEARCH_DEBOUNCE_MS,
  classifyPlaceTypes,
  meetsSearchMinLength,
} from '@harema/shared/constants'

/** 分類済みの 1 候補。表示は name / address のみ、選択確定に prediction(toPlace)を使う。 */
export type ClassifiedSuggestion = {
  placeId: string
  mainText: string
  secondaryText: string
  /** Google が返した順の 0 始まりの番号(捨てた候補は数えない)。 */
  rank: number
  prediction: google.maps.places.PlacePrediction
}

export type GroupedSuggestions = {
  food: ClassifiedSuggestion[]
  location: ClassifiedSuggestion[]
}

const EMPTY: GroupedSuggestions = { food: [], location: [] }

/** 取得結果と、それを取得したときの入力(trim 済)。現在入力と一致するときだけ表示する。 */
type FetchedSuggestions = {
  query: string
  groups: GroupedSuggestions
}

const NO_FETCH: FetchedSuggestions = { query: '', groups: EMPTY }

/** Autocomplete に渡せる bias のうち、本アプリが使う形(矩形 = 地図の表示範囲 / 点 = 既定エリア)。 */
type LocationBias =
  | google.maps.LatLngBoundsLiteral
  | google.maps.LatLngLiteral

type Params = {
  places: google.maps.PlacesLibrary | null
  input: string
  enabled: boolean
  /**
   * IME で変換中か。変換中の入力は「まだ言葉になっていない」ので送らない(裁定 2026-08-07)。
   * ローマ字入力では 1 打ごとに未確定文字列が変わり、そのすべてが候補にならない語のまま課金対象の
   * リクエストになる。確定した時点でこのフラグが降り、そこから 1 回だけ発火する。
   */
  composing: boolean
  /**
   * bias は「リクエストを送る時点」の値で解決したいので、値ではなく getter で受ける。
   * 地図のパン・ズームのたびに再購読すると、そのつど候補を取り直すことになるため。
   */
  getLocationBias: () => LocationBias | null
  onError: () => void
}

/**
 * Autocomplete。無フィルタ 1 リクエストで候補を取り、クライアント側で types を共有定数と交差
 * させて「飲食」「場所」へ分類し(非該当は破棄)、残した候補に Google の順の rank を付ける
 * (`classifySuggestions`)。スイッチの切り替えでは取り直さない。
 * 発火するのは **IME の変換が確定していて、
 * かつ `meetsSearchMinLength` を満たす入力**だけ。デバウンス(SEARCH_DEBOUNCE_MS)+
 * AutocompleteSessionToken(選択確定の fetchFields までを 1 セッション・確定後に resetSession で
 * 再生成)。連続入力の stale レスポンスは世代 id で破棄する。取得失敗は onError。
 *
 * 候補の name / address は画面表示のためだけに保持し、DB・サーバへ送らない(規約遵守)。
 */
export function useAutocompleteSuggestions({
  places,
  input,
  enabled,
  composing,
  getLocationBias,
  onError,
}: Params): {
  suggestions: GroupedSuggestions
  resetSession: () => void
  discardSessionToken: () => void
} {
  const [fetched, setFetched] = useState<FetchedSuggestions>(NO_FETCH)
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const requestIdRef = useRef(0)

  // パン・ズームで再取得しないよう bias と onError は ref 経由で読む(effect の依存から外す)。
  const getLocationBiasRef = useRef(getLocationBias)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    getLocationBiasRef.current = getLocationBias
    onErrorRef.current = onError
  }, [getLocationBias, onError])

  /**
   * トークンだけを捨てる(候補の表示は残す)。**1 つのトークンを 2 つのセッションに使うと、
   * そのセッションのリクエストが 1 件ずつ個別に課金される**ため、選択確定がどう終わっても
   * ——成功・失敗・座標欠落—— 再利用の芽をここで断つ。
   * 逐語:"Each session token is valid for a single session; reusing a token invalidates the
   * session, and requests will be charged without the session token benefit."
   * (`https://developers.google.com/maps/documentation/places/web-service/usage-and-billing`)
   */
  const discardSessionToken = useCallback(() => {
    sessionTokenRef.current = null
  }, [])

  const resetSession = useCallback(() => {
    discardSessionToken()
    setFetched(NO_FETCH)
  }, [discardSessionToken])

  const trimmed = input.trim()
  // 発火条件。空でないことに代えて「変換が確定していて、かつ最小文字数(漢字例外つき)を満たす」を
  // 課す。表示側も同じ条件で見るので、送っていない入力の候補が残ることはない。
  const active =
    Boolean(places) && enabled && !composing && meetsSearchMinLength(trimmed)

  useEffect(() => {
    // 停止条件は「派生」で表す(空入力 / 無効時は返り値を EMPTY に落とす)。effect 本体で
    // 同期 setState しない(React 19 set-state-in-effect。取得結果の反映は timer/Promise 内)。
    if (!places || !active) return

    const requestId = ++requestIdRef.current
    let cancelled = false

    const timer = window.setTimeout(() => {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new places.AutocompleteSessionToken()
      }
      // デバウンス満了の時点で解決する = 実際に検索する瞬間の地図の見え方を反映する。
      const bias = getLocationBiasRef.current()
      void places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        sessionToken: sessionTokenRef.current,
        ...(bias ? { locationBias: bias } : {}),
      })
        .then(({ suggestions: raw }) => {
          if (cancelled || requestId !== requestIdRef.current) return
          const grouped: GroupedSuggestions = classifySuggestions(raw, classifyPlaceTypes)
          setFetched({ query: trimmed, groups: grouped })
        })
        .catch(() => {
          if (cancelled || requestId !== requestIdRef.current) return
          setFetched(NO_FETCH)
          onErrorRef.current()
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [places, active, trimmed])

  // 取得結果は「その取得時のクエリ」が現在入力と一致するときだけ出す。手動で全消し → 再入力の
  // 瞬間に旧クエリの候補がちらつくのを防ぐ(fetch 完了までは EMPTY)。
  const suggestions =
    active && fetched.query === trimmed ? fetched.groups : EMPTY

  return { suggestions, resetSession, discardSessionToken }
}
