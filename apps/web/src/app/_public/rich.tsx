import { Fragment, type ReactNode } from 'react'

/** 行より長い時だけ中で折れる塊のインライン指定(JpText・LegalBody の UNIT と同じ値)。 */
const SENT_STYLE = { display: 'inline-block', maxWidth: '100%' } as const

type Slots = Readonly<Record<string, ReactNode>>

/**
 * 公開ページの文の印(copy/index.ts の RICH_MARKS)を、和文の折れ方を持つ要素にする。
 * `|` → <wbr />・`⟦…⟧` → .nw・`⟨…⟩` → .sent(inline-block)・`⟪…⟫` → .sent・`⟮…⟯` → .ln・`{名前}` → slots の部品。
 * 印を 1 つも持たない文(英語)は、そのままの文字列で返す。入れ子を読む(閉じない印は投げる。余った閉じの印は投げずに字として出るので、数の照合は public-locale.test.mjs の「閉じていない折れの印が無い」が持つ)。
 */
export function Rich({ text, slots = {} }: { text: string; slots?: Slots }) {
  const [nodes, end] = parse(text, 0, undefined, slots)
  if (end !== text.length) throw new Error(`Rich: unbalanced mark in: ${text}`)
  return <>{nodes}</>
}

const CLOSE: Record<string, string> = { '⟦': '⟧', '⟨': '⟩', '⟪': '⟫', '⟮': '⟯' }

function wrap(open: string, key: number, children: ReactNode[]): ReactNode {
  if (open === '⟦') return <span key={key} className="nw">{children}</span>
  if (open === '⟨') return <span key={key} className="sent" style={SENT_STYLE}>{children}</span>
  if (open === '⟪') return <span key={key} className="sent">{children}</span>
  return <span key={key} className="ln">{children}</span>
}

function parse(text: string, from: number, close: string | undefined, slots: Slots): [ReactNode[], number] {
  const out: ReactNode[] = []
  let buf = ''
  let i = from
  const flush = () => { if (buf) { out.push(<Fragment key={out.length}>{buf}</Fragment>); buf = '' } }
  while (i < text.length) {
    const ch = text[i]!
    if (close !== undefined && ch === close) { flush(); return [out, i + 1] }
    if (ch === '|') { flush(); out.push(<wbr key={out.length} />); i++; continue }
    if (ch in CLOSE) {
      flush()
      const [children, next] = parse(text, i + 1, CLOSE[ch], slots)
      out.push(wrap(ch, out.length, children))
      i = next
      continue
    }
    if (ch === '{') {
      const endBrace = text.indexOf('}', i)
      const name = endBrace < 0 ? '' : text.slice(i + 1, endBrace)
      if (!(name in slots)) throw new Error(`Rich: no slot "${name}" in: ${text}`)
      flush()
      out.push(<Fragment key={out.length}>{slots[name]}</Fragment>)
      i = endBrace + 1
      continue
    }
    buf += ch
    i++
  }
  if (close !== undefined) throw new Error(`Rich: missing ${close} in: ${text}`)
  flush()
  return [out, i]
}
