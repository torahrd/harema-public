import { Fragment } from 'react'
import { jpLines } from '../_ui/jp-lines'
import { splitLinks } from './linkify-core'
import type { Block, LegalDocument, Paragraph } from './legal'

export function Linkify({ text }: { text: string }) {
  return splitLinks(text).map((part, index) => part.kind === 'url'
    ? <a key={index} href={part.value} target="_blank" rel="noopener">{part.value}</a>
    : <span key={index}>{part.value}</span>)
}

/** 句と文を、ほかの所で折れない塊にする(行より長い塊だけは中で折れる)。JpText と同じ。 */
const UNIT = { display: 'inline-block', maxWidth: '100%' } as const
/** 文と句に切る間、URL を 1 字の印に置き換える(URL の中の「?」「!」で切らないため)。私用領域の字で、本文には出ない。 */
const URL_MARK = '\uE000'
/** 句の中で折ってよい位置の印(ゼロ幅スペース U+200B)。前文の 1 句が 1 行に入らないときに、助詞を行頭に出さない位置を md に書く。画面には出さない。 */
const BREAK = '\u200B'

/**
 * 前文を、和文の折り方の決まり(所有者 2026-11-04:文ごとに行を始め、文の中は「、」「。」の後だけで折る。入る限り 1 行に詰める)
 * で描き、URL はリンクにする。折り方は JpText(jpLines)と同じ。前文の句は 402px の 1 行に入る長さに書いてある。
 */
export function PhrasedLinkify({ text }: { text: string }) {
  const parts = splitLinks(text)
  const urls = parts.flatMap((part) => part.kind === 'url' ? [part.value] : [])
  const masked = parts.map((part) => part.kind === 'url' ? URL_MARK : part.value).join('')
  let next = 0
  // 句(「、」「。」まで)は今までどおり 1 つの塊。句が 1 行に入らない時だけ、印(BREAK)の位置で句の中を折る。
  // 印で切った塊の末尾の空白は塊の外に出す(塊の中の行末の空白は描かれず、隣の塊と字が詰まるため)。
  const sentences = jpLines(masked).map((phrases) => phrases.map((phrase) => {
    const units = phrase.split(BREAK)
    return units.map((unit, u) => {
      const gap = u < units.length - 1 && unit.endsWith(' ')
      return { gap, pieces: (gap ? unit.slice(0, -1) : unit).split(URL_MARK).map((piece, i) => ({ url: i > 0 ? urls[next++] : undefined, piece })) }
    })
  }))
  const piecesOf = (pieces: { url: string | undefined; piece: string }[]) => pieces.map(({ url, piece }, i) => <span key={i}>{url !== undefined && <a href={url} target="_blank" rel="noopener">{url}</a>}{piece}</span>)
  return sentences.map((phrases, s) => (
    <span key={s} style={UNIT}>
      {phrases.map((units, p) => (
        <span key={p} style={UNIT}>
          {units.length === 1
            ? piecesOf(units[0]!.pieces)
            : units.map(({ gap, pieces }, u) => <Fragment key={u}><span style={UNIT}>{piecesOf(pieces)}</span>{gap && ' '}</Fragment>)}
        </span>
      ))}
    </span>
  ))
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, index) => {
    const seg = `b${index + 1}`
    if (block.kind === 'list') return <ul key={seg} data-legal-seg={seg}>{block.items.map((entry, n) => <li key={n} data-legal-leaf={`l${n + 1}`}><Linkify text={[entry.label, ...entry.sentences].filter(Boolean).join(' —— ')} /></li>)}</ul>
    if (block.kind === 'table') return <table key={seg} data-legal-seg={seg}><thead><tr>{block.header.map((cell, n) => <th key={n} data-legal-leaf={`r0c${n + 1}`}><Linkify text={cell} /></th>)}</tr></thead><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} data-legal-leaf={`r${r + 1}c${c + 1}`}><Linkify text={cell} /></td>)}</tr>)}</tbody></table>
    const Container = block.kind === 'note' ? 'blockquote' : 'div'
    return <Container key={seg} data-legal-seg={seg}>{block.sentences.map((sentence, n) => <p key={n} data-legal-leaf={`t${n + 1}`}><Linkify text={sentence} /></p>)}</Container>
  })
}

function ParagraphBody({ paragraph }: { paragraph: Paragraph }) {
  return <>
    {paragraph.heading && <h3 data-legal-leaf="h">{paragraph.heading}</h3>}
    {paragraph.sentences.map((sentence, n) => <p key={n} data-legal-leaf={`t${n + 1}`}><Linkify text={sentence} /></p>)}
    {paragraph.items.length > 0 && <ol>{paragraph.items.map((item, n) => <li key={n} data-legal-seg={`i${n + 1}`} value={item.no}>{item.sentences.map((sentence, j) => <p key={j} data-legal-leaf={`t${j + 1}`}><Linkify text={sentence} /></p>)}<Blocks blocks={item.blocks} /></li>)}</ol>}
    <Blocks blocks={paragraph.blocks} />
  </>
}

export function LegalBody({ document, name, lang = 'ja' }: { document: LegalDocument; name: 'terms' | 'privacy'; lang?: 'ja' | 'en' }) {
  return <div className="public-legal-body" data-legal-body={name}>
    {/* 前文の折り方(PhrasedLinkify)は和文の決まり。英語は語の間で折れるので通さない。 */}
    {document.preamble.map((sentence, n) => <div key={n} data-legal-seg={`pre${n + 1}`}><p data-legal-leaf="t">{lang === 'en' ? <Linkify text={sentence} /> : <PhrasedLinkify text={sentence} />}</p></div>)}
    {document.articles.map((article) => <section key={article.no} data-legal-seg={`a${article.no}`}><h2 data-legal-leaf="h">{lang === 'en' ? <>Article {article.no} ({article.heading})</> : <>第 {article.no} 条({article.heading})</>}</h2>{article.paragraphs.map((paragraph, n) => paragraph.no
      ? (n > 0 && article.paragraphs[n - 1]?.no ? null : <ol key={n}>{article.paragraphs.slice(n).filter((entry, j, all) => entry.no && all.slice(0, j).every((prior) => prior.no)).map((entry, offset) => <li key={offset} data-legal-seg={`p${n + offset + 1}`} value={entry.no}><ParagraphBody paragraph={entry} /></li>)}</ol>)
      : <div key={n} data-legal-seg={`p${n + 1}`}><ParagraphBody paragraph={paragraph} /></div>)}</section>)}
  </div>
}
