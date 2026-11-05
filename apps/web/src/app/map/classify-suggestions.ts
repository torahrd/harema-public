/**
 * Autocomplete の候補を「飲食」「場所」へ分ける純粋な関数(react・Google の値を import しない)。
 * 残した候補に、Google が返した順の 0 始まりの通し番号 `rank` を付ける(群ごとでなく、捨てた
 * 候補は数えない)。スイッチがオンの時に飲食と場所を Google の順のまま混ぜるのに使う。
 */

/** Google の `PlacePrediction` のうち、ここで読む部分だけ(型の構造)。 */
type PredictionLike = {
  placeId: string
  types: string[]
  text: { text: string }
  mainText?: { text: string } | null
  secondaryText?: { text: string } | null
}

export type RankedSuggestion<P extends PredictionLike> = {
  placeId: string
  mainText: string
  secondaryText: string
  rank: number
  prediction: P
}

export function classifySuggestions<P extends PredictionLike>(
  raw: readonly { placePrediction?: P | null }[],
  classify: (types: string[]) => 'food' | 'location' | null,
): { food: RankedSuggestion<P>[]; location: RankedSuggestion<P>[] } {
  const grouped: { food: RankedSuggestion<P>[]; location: RankedSuggestion<P>[] } = {
    food: [],
    location: [],
  }
  let rank = 0
  for (const item of raw) {
    const prediction = item.placePrediction
    if (!prediction) continue
    const bucket = classify(prediction.types)
    if (!bucket) continue
    grouped[bucket].push({
      placeId: prediction.placeId,
      mainText: prediction.mainText?.text ?? prediction.text.text,
      secondaryText: prediction.secondaryText?.text ?? '',
      rank,
      prediction,
    })
    rank += 1
  }
  return grouped
}
