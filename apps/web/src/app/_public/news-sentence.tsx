import { Fragment } from 'react'
import { newsPhrases } from './news'

/**
 * 説明の 1 文。日本語は句(「、」の後まで)の中では折らず、句の間だけで折れる。LP と /news が共有する。
 * 英語は語の間で折れるので、句に切らず文のまま出す(「/」の印を持たない)。
 */
export function NewsSentence({ text, locale = 'ja' }: { text: string; locale?: 'ja' | 'en' }) {
  if (locale === 'en') return <span className="sent">{text}</span>
  return <span className="sent">{newsPhrases(text).map((phrase, i) => <Fragment key={i}>{i > 0 ? <wbr /> : null}<span className="nw">{phrase}</span></Fragment>)}</span>
}
