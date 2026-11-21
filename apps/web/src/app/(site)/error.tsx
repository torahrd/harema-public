'use client'

import { ja } from '@harema/shared/i18n'
import ErrorView from '@/app/_shell/error-view'

// 公開ページの 500。言語は要求から決めない(静的のまま)ので、日本語の辞書をそのまま渡す。
export default function SiteError({ reset }: { reset: () => void }) {
  return (
    <ErrorView
      reset={reset}
      copy={{ ...ja.web.error.failed, action: ja.web.common.retry }}
    />
  )
}
