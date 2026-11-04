/**
 * 和文の折り方の決まり(所有者 2026-11-04):文ごとに行を始め、文の中は「、」「。」の後だけで折る。入る限り 1 行に詰める。
 * 文を「文」→「句読点までの句」の 2 段に切る。純粋(import なし)。つなぐと元の文。
 */
const SENTENCE_END = new Set(['。', '！', '？', '!', '?'])
const PHRASE_END = new Set(['、', '，'])
const CLOSE = new Set(['」', '』', '）', ')'])

/** 文ごとに、句読点の後で切った句の列を返す。句読点の直後の閉じ括弧は前の句に付ける。 */
export function jpLines(text: string): string[][] {
  const sentences: string[][] = []
  let phrases: string[] = []
  let current = ''
  let pending: 'sentence' | 'phrase' | null = null
  for (const ch of Array.from(text)) {
    if (pending !== null && !CLOSE.has(ch)) {
      phrases.push(current)
      current = ''
      if (pending === 'sentence') {
        sentences.push(phrases)
        phrases = []
      }
      pending = null
    }
    current += ch
    if (SENTENCE_END.has(ch)) pending = 'sentence'
    else if (PHRASE_END.has(ch)) pending = 'phrase'
  }
  if (current !== '') phrases.push(current)
  if (phrases.length > 0) sentences.push(phrases)
  return sentences
}
