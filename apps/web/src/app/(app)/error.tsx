'use client'

import { useTranslations } from 'next-intl'
import ErrorView from '@/app/_shell/error-view'
import { asLines } from '@/i18n/lines'

// アプリの画面の 500。文言は表示言語の辞書(layout の NextIntlClientProvider が渡す)。
export default function AppError({ reset }: { reset: () => void }) {
  const t = useTranslations('web.error.failed')
  const common = useTranslations('web.common')
  return (
    <ErrorView
      reset={reset}
      copy={{ heading: asLines(t.raw('heading')), lede: t('lede'), action: common('retry') }}
    />
  )
}
