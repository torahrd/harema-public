'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { LOCALES, LOCALE_NAMES, type Locale } from '@harema/shared/i18n'
import { setLocale } from '@/i18n/actions'
import { GlobeIcon } from './globe-icon'

/**
 * 言語の切り替え(地球の印 +「日本語｜English」の 2 つ並び。所有者の決定・harema#150 の案 B)。
 * 切り替えの形は保存のシートの 3 状態の切り替えと同じ値(globals.css の .qs-lsw)。
 * 名前(日本語・English)は訳さず、どの言語の画面でも同じ字(LOCALE_NAMES)で出す。
 * row(ログイン後のメニュー): 押すと Server Action(setLocale)が言語を端末に覚えさせる。サーバが、ログイン済みで今の改定に同意した人にだけ書く。失敗(投げた時・{ ok: false })は何も変えない。
 * head(ログイン画面): 同意していない訪問者の端末に cookie を書かない(所有者 2026-11-21)。URL の `?lang=` を替えて、この画面の表示言語だけを替える
 * (選んだ言語はログインの受付が同意の記録の後に cookie へ書く。login-form.tsx)。Server Action を呼ばない。
 * `reload`: ログイン後の画面(メニュー)で渡す。地図の SDK は読み込み済みの言語を替えられないので、
 * 成功の後に頁全体を読み直す。ログイン画面は同じ往復の描き直しで足りる。
 */
export function LangSwitch({
  variant,
  reload = false,
  disabled = false,
  onPendingChange,
}: {
  /** head = ログイン画面の頭(地球の印つき)。row = メニューの行の右(地球の印は行の左の字の側にある)。 */
  variant: 'head' | 'row'
  reload?: boolean
  /** メニューでログアウトの往復の間は押せなくする(ほかの項目と同じ)。 */
  disabled?: boolean
  /** 往復の始まりと終わりを親に知らせる(メニューは往復の間ログアウトを押せなくする)。 */
  onPendingChange?: (pending: boolean) => void
}) {
  const current = useLocale()
  const t = useTranslations('web.common')
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const choose = async (next: Locale) => {
    if (pending || disabled || next === current) return
    if (variant === 'head') {
      // 表示だけを替える(cookie を書かない)。描き直しは頁の遷移で行う。
      router.replace(`${pathname}?lang=${next}`)
      return
    }
    setPending(true)
    onPendingChange?.(true)
    // 読み直しを始めたら、新しい頁が届くまで押せないままにする(ログアウトも同じ)。
    let reloading = false
    try {
      const result = await setLocale(next)
      if (result.ok && reload) {
        reloading = true
        window.location.reload()
      }
    } catch {
      // 通信の失敗・古い頁の Server Action の不一致。表示は今の言語のまま(押し直せる)。
    } finally {
      if (!reloading) {
        setPending(false)
        onPendingChange?.(false)
      }
    }
  }

  return (
    <div className={variant === 'head' ? 'qs-lsw' : 'qs-lsw qs-lsw-row'} role="group" aria-label={t('language')}>
      {variant === 'head' && <GlobeIcon />}
      <div className="qs-lsw-seg">
        {LOCALES.map((value) => (
          <button
            key={value}
            type="button"
            lang={value}
            aria-pressed={value === current}
            disabled={pending || disabled}
            onClick={() => void choose(value)}
          >
            {LOCALE_NAMES[value]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 公開ページ(_public/lang-links.tsx)は Server Action を持つこのファイルを読まないよう、絵は globe-icon.tsx にある。 */
export { GlobeIcon }
