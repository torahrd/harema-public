import { z } from 'zod'
import { LIST_ICON_MAX_LENGTH } from '../constants'
import { codePointLength } from './char-length'

/**
 * RGI 絵文字(Unicode の推奨する絵文字の並び)1 つ。`v` フラグ + `\p{RGI_Emoji}`(Node 22+・Chrome 112+・
 * Safari 17+・Firefox 116+)。TS の target が ES2022 でリテラルの `v` フラグを拒むため、`RegExp` の
 * コンストラクタで作る(挙動は同じ)。
 * 作るのは最初に使う時で、module の読み込みの時ではない。`v` フラグか `Intl.Segmenter` の無い古いブラウザで
 * module の読み込みが投げると、この validations を読む画面ごと開けなくなるため。無い時の緩い判定は `isListIcon` の説明のとおり。
 */
let rgiEmoji: RegExp | null | undefined
function strictEmoji(): RegExp | null {
  if (rgiEmoji === undefined) {
    try {
      rgiEmoji = new RegExp('^\\p{RGI_Emoji}$', 'v')
    } catch {
      rgiEmoji = null
    }
  }
  return rgiEmoji
}

/**
 * 制御・書式・未割当・私用・サロゲート(\p{C})と、空白・区切り(\p{Z}・\s)、分類が文字・記号でも見えない字
 * (ハングルの埋め字 U+115F・U+1160・U+3164・U+FFA0、点字の空白 U+2800、物体の置換 U+FFFC、頭の無い音符 U+1D159)。
 * `\p{Default_Ignorable_Code_Point}` は異体字セレクタ(IVS)も含み漢字を拒むので使わない。
 */
const INVISIBLE = /[\p{C}\p{Z}\s\u115f\u1160\u3164\uffa0\u2800\ufffc\u{1d159}]/u
/** 非絵文字の 1 文字の末尾に付く肌色の修飾(U+1F3FB〜1F3FF)。前の字と合わず 2 つの絵に並ぶので拒む。 */
const TRAILING_MODIFIER = /[^][\u{1f3fb}-\u{1f3ff}]/u
/** タグ文字の旗(イングランドなど・RGI)。緩い判定でもタグ文字(Cf)のために拒まない。 */
const TAG_FLAG = /^\u{1f3f4}[\u{e0020}-\u{e007e}]+\u{e007f}$/u
/** 先頭が結合記号(\p{M})。 */
const LEADING_MARK = /^\p{M}/u
const ZWJ = /\u200d/g

let graphemes: Intl.Segmenter | null | undefined
function graphemeSegmenter(): Intl.Segmenter | null {
  if (graphemes === undefined) {
    graphemes =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null
  }
  return graphemes
}

/**
 * 値が「リストのアイコンに使える 1 文字」か。1〜`LIST_ICON_MAX_LENGTH` コードポイント・書記素 1 つで、
 * RGI 絵文字なら通す(ZWJ の列 👨‍👩‍👧・旗 🇯🇵・肌色 👍🏽・異体字セレクタつき ✈️ など)。
 * そうでなければ、(a) 3 コードポイント以下、(b) 制御・書式・未割当・私用・サロゲート・空白を含まない、
 * (c) 先頭が結合記号でない、のすべてを満たす時に通す(漢字・かな・英数・記号。異体字セレクタつきの漢字・
 * 濁点の結合形も通る。結合記号の重ね・ZWJ・双方向の制御・空白・見えない文字は拒む)。
 * 出どころ: 単位 lists の所有者の決定 2026-11-16 19:27 JST(harema#152。先の「絵文字 1 つ」は取り下げ)。
 * `v` フラグが無い環境では RGI の判定ができないので、(a) を外して ZWJ と異体字セレクタを許す緩い判定にする
 * (コードポイント 32 以下・見えない文字を含まない・先頭が結合記号でない)。`Intl.Segmenter` が無ければ書記素の数も見ない。
 * 正の判定をサーバが持つのは web の Server Action を通る時だけで、DB は長さしか見ない。
 * mobile から直接書く単位(PR3)は、書く前に厳しい判定が動くことを確かめる。
 */
export function isListIcon(value: string): boolean {
  const length = codePointLength(value)
  if (length < 1 || length > LIST_ICON_MAX_LENGTH) return false
  const segmenter = graphemeSegmenter()
  if (segmenter !== null) {
    const iterator = segmenter.segment(value)[Symbol.iterator]()
    const first = iterator.next()
    if (first.done || !iterator.next().done) return false
  }
  if (LEADING_MARK.test(value)) return false
  const strict = strictEmoji()
  if (strict === null) {
    if (TAG_FLAG.test(value)) return true
    const rest = value.replace(ZWJ, '')
    return rest !== '' && !LEADING_MARK.test(rest) && !INVISIBLE.test(rest)
  }
  if (strict.test(value)) return true
  return length <= 3 && !INVISIBLE.test(value) && !TRAILING_MODIFIER.test(value)
}

/**
 * リストのアイコンの検査。1 文字(`isListIcon`)か null(アイコンなし)だけを通す。
 * 長さの検査(DB CHECK の鏡像)は `listIconLengthSchema`(`list.ts`)が持ち、これはその中身の検査。
 */
export const listIconSchema = z.string().refine(isListIcon).nullable()

/**
 * 読みの入口。DB から読んだ `icon` が 1 文字(`isListIcon`)ならそのまま返し、外れた値・空の文字列は null(アイコンなし)にする。
 * 古い値や将来の共有で外れた文字が入っても、そのまま画面に出さない。
 */
export function readListIcon(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  return isListIcon(value) ? value : null
}
