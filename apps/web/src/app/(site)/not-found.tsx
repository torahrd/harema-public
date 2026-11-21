import { ja } from '@harema/shared/i18n'
import NotFoundView from '@/app/_shell/not-found-view'

// 公開ページと、どの道にも当たらない URL の 404。言語は要求から決めない(静的のまま)ので、日本語の辞書をそのまま渡す。
export default function SiteNotFound() {
  return <NotFoundView copy={ja.web.error.notFound} />
}
