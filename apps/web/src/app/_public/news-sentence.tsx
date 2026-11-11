import { Fragment } from 'react'
import { newsPhrases } from './news'

/** 説明の 1 文。句(「、」の後まで)の中では折らず、句の間だけで折れる。LP と /news が共有する。 */
export function NewsSentence({ text }: { text: string }) {
  return <span className="sent">{newsPhrases(text).map((phrase, i) => <Fragment key={i}>{i > 0 ? <wbr /> : null}<span className="nw">{phrase}</span></Fragment>)}</span>
}
