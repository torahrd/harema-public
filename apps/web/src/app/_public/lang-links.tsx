import Link from 'next/link'
import { LOCALES, LOCALE_NAMES } from '@harema/shared/i18n'
import { GlobeIcon } from '@/app/_ui/globe-icon'
import { otherLanguagePath } from '@/lib/site'
import { publicCopy, type PublicLocale } from './copy'

/**
 * 公開ページの言語の切り替え(足に置く。所有者の決定・harema#150 の案 B =「地球の印 + 日本語｜English」の 2 つ並び)。
 * アプリの画面の切り替えと同じ見た目の値(globals.css の .qs-lsw)で、中身は別:
 * 公開ページは静的で cookie を書かないので、押す物は相手の言語の同じ頁への `<Link>`。今の言語の側は押せない(`aria-current`)。
 * Server Component で、JavaScript・Server Action・cookie を持たない。
 * `path` は今の頁の道。言語の対に無い道(/about・/coming-soon・/share ほか)は何も出さない。
 */
export function LangLinks({ locale, path }: { locale: PublicLocale; path: string }) {
  const other = otherLanguagePath(path)
  if (other === null) return null
  return (
    <div className="qs-lsw" role="group" aria-label={publicCopy(locale).nav.language}>
      <GlobeIcon />
      <div className="qs-lsw-seg">
        {LOCALES.map((value) => value === locale
          ? <span key={value} lang={value} aria-current="true">{LOCALE_NAMES[value]}</span>
          : <Link key={value} lang={value} hrefLang={value} href={other} prefetch={false}>{LOCALE_NAMES[value]}</Link>)}
      </div>
    </div>
  )
}
