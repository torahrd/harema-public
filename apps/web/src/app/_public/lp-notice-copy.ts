import type { LpNoticeKind } from '@/lib/lp-notice'

// 所有者の決定(案 C)の文言。足さない・変えない。部品が文の間に <wbr /> を挟む。
export const LP_NOTICE_LINES: Record<LpNoticeKind, readonly string[]> = {
  logout: ['ログアウトしました。'],
  withdraw: ['退会しました。', 'ご利用ありがとうございました。'],
}

export const LP_NOTICE_CLOSE_LABEL = '閉じる'
