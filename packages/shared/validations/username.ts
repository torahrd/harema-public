import { z } from 'zod'
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../constants'
import { codePointLength } from './char-length'

/**
 * ユーザー名に使えない「見えない文字」を 1 つでも含むか(ユーザー承認, 2026-07-19 / design RULES)。
 *
 * 除外対象は**不可視・制御・方向制御文字のみ**:
 * - 制御文字 C0(0x00–0x1F・タブ/改行/復帰を含む)/ DEL(0x7F)/ C1(0x80–0x9F)
 * - ゼロ幅・不可視フォーマット文字:ZWSP(U+200B)/ ZWNJ(U+200C)
 * - 双方向制御:LRM/RLM(U+200E/200F)/ 埋め込み・上書き(U+202A–202E)/ 分離(U+2066–2069)
 * - 単語結合子・不可視演算子(U+2060–2064)/ BOM・ZWNBSP(U+FEFF)
 *
 * 日本語・英数・記号・**絵文字**は自由。**絵文字合成を壊さないため ZWJ(U+200D)と
 * 異体字セレクタ(U+FE00–FE0F)は許可**する(除外判定の前に通す)。制御文字を正規表現リテラルへ
 * 直に埋め込まず、コードポイントの数値比較で判定する(可読性とエスケープ事故の回避)。
 *
 * スキーマの refine と、Onboarding フォームの error 状態判定で同一ロジックを使う(単一の真実源)。
 */
export function hasForbiddenUsernameCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)
    if (code === undefined) continue
    // 絵文字に必要な結合子・異体字セレクタは許可(除外判定の前に通す)。
    if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) continue
    if (
      code <= 0x1f || // C0(タブ・改行・復帰を含む)
      (code >= 0x7f && code <= 0x9f) || // DEL・C1
      code === 0x200b || // ZERO WIDTH SPACE
      code === 0x200c || // ZERO WIDTH NON-JOINER
      code === 0x200e || // LEFT-TO-RIGHT MARK
      code === 0x200f || // RIGHT-TO-LEFT MARK
      (code >= 0x202a && code <= 0x202e) || // 双方向 埋め込み/上書き
      (code >= 0x2060 && code <= 0x2064) || // 単語結合子・不可視演算子
      (code >= 0x2066 && code <= 0x2069) || // 双方向 分離
      code === 0xfeff // ZWNBSP / BOM
    ) {
      return true
    }
  }
  return false
}

/**
 * ユーザー名の寛容ルール(ユーザー承認, 2026-07-19)。
 *
 * 前後空白を trim した上で、コードポイントで 1〜15 文字(DB CHECK
 * `char_length(username) between 1 and 15` の鏡像)。拒否するのは不可視・制御・方向制御文字
 * (`hasForbiddenUsernameCharacter`)と、trim 後に空になるもの(空文字・全角含む全空白は trim で
 * 空へ畳まれる)だけ。日本語・英数・記号・絵文字・内部空白・大小はすべて許可する(**寛容ルール**)。
 * DB CHECK は緩めず長さのみを二重化する(文字種はアプリ層 Zod だけで判定し DB に持ち込まない)。
 *
 * クライアント(Onboarding フォーム)とサーバ(Server Action)で同一スキーマを使い回す(§8)。trim を
 * 含むため、パース結果は前後空白の除かれた値になる(保存されるのはこの正規化後の値)。
 */
export const usernameSchema = z
  .string()
  .trim()
  .refine((value) => !hasForbiddenUsernameCharacter(value))
  .refine((value) => {
    const length = codePointLength(value)
    return length >= USERNAME_MIN_LENGTH && length <= USERNAME_MAX_LENGTH
  })
