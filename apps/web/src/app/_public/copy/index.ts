// 公開ページ(LP・更新情報・規約・ポリシーとその英語版)の文。辞書(packages/shared/i18n)には入れない(長い文は頁ごとの中身として持つ。i18n 計画 2.3)。
// 置き方の約束: 相対 import だけ。頁は言語を引数で受け、要求(cookie・Accept-Language)を読まない = 静的のまま。
import { ja } from './ja'
import { en } from './en'

export type PublicLocale = 'ja' | 'en'
/** 2 つの言語の文は同じ形(en.ts は ja.ts の型で縛る)。 */
export type PublicCopy = typeof ja

const COPY: Record<PublicLocale, PublicCopy> = { ja, en }

export function publicCopy(locale: PublicLocale): PublicCopy {
  return COPY[locale]
}

/**
 * 文の中の印(rich.tsx が読む。和文の折れ方を文の側が持つための物。英語の文には使わない):
 * `|` = 折ってよい位置(<wbr />)・`⟦…⟧` = 折らない塊(.nw)・`⟨…⟩` = 行より長い時だけ中で折れる塊(.sent・inline-block)・
 * `⟪…⟫` = 同じ塊(インライン指定なし。.sent)・`⟮…⟯` = 見出しの改行の塊(.ln)・`{名前}` = 部品の差し込み。
 */
export const RICH_MARKS = ['|', '⟦', '⟧', '⟨', '⟩', '⟪', '⟫', '⟮', '⟯'] as const
