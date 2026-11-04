import { jpLines } from './jp-lines'

/** 句と文を、ほかの所で折れない塊にする(行より長い塊だけは中で折れる)。 */
const UNIT = { display: 'inline-block', maxWidth: '100%' } as const

/**
 * 和文を決まりどおりに折って描く(`jpLines`)。文と句をそれぞれ inline-block にするので、
 * 折れ目は句読点の後だけになり、入りきらない文は次の行から始まる。
 */
export function JpText({ text }: { text: string }) {
  return (
    <>
      {jpLines(text).map((phrases, s) => (
        <span key={s} style={UNIT}>
          {phrases.map((phrase, p) => (
            <span key={p} style={UNIT}>
              {phrase}
            </span>
          ))}
        </span>
      ))}
    </>
  )
}
