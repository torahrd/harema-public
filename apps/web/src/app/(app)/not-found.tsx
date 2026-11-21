import { getTranslations } from 'next-intl/server'
import NotFoundView from '@/app/_shell/not-found-view'
import { asLines } from '@/i18n/lines'

// アプリの画面の 404。文言は表示言語の辞書。
export default async function AppNotFound() {
  const t = await getTranslations('web.error.notFound')
  return <NotFoundView copy={{ heading: asLines(t.raw('heading')), lede: t('lede'), action: t('action') }} />
}
