export type TextPart = { kind: 'text' | 'url'; value: string }

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let from = 0
  const starts = /https?:\/\//g
  for (const match of text.matchAll(starts)) {
    const start = match.index
    if (start < from) continue
    if (start > from) parts.push({ kind: 'text', value: text.slice(from, start) })
    let end = start
    while (end < text.length && /^[\x21-\x28\x2A-\x7E]$/.test(text[end] ?? '')) end++
    const url = text.slice(start, end)
    parts.push({ kind: 'url', value: url })
    from = end
  }
  if (from < text.length) parts.push({ kind: 'text', value: text.slice(from) })
  return parts
}
