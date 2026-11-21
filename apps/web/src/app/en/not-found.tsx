import { en } from '@harema/shared/i18n'
import NotFoundView from '@/app/_shell/not-found-view'

// /en/... の当たらない道の 404。言語は要求から決めない(静的のまま)ので、英語の辞書をそのまま渡し、戻る先は /en。
export default function EnNotFound() {
  return <NotFoundView copy={en.web.error.notFound} homeHref="/en" />
}
