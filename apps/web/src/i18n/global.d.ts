import type { Messages } from '@harema/shared/i18n'

// next-intl の鍵と辞書の型を結ぶ(存在しない鍵を t() に渡すと typecheck が落ちる)。
declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages
  }
}
