import Script from 'next/script'
import { analyticsEnv } from '@/env/analytics'

/**
 * 公開ページ(LP・利用規約・プライバシーポリシー・Coming soon)だけに置く Google アナリティクス 4 の部品
 * (所有者の決定 2026-11-03 12:13 JST)。ログインの後の画面には置かない —— 店の識別子を含む道
 * (`/places/...`)や保存した店の操作を Google へ送らないため(プライバシーポリシー第 5 条 1 項)。
 * 測定 ID が無い build(local・Preview の既定)では何も出さない。
 * ID は env の検証で `G-` + 英大文字と数字に限っているので、下の文字列に埋めても式を壊さない。
 */
export function SiteAnalytics() {
  const id = analyticsEnv.gaMeasurementId
  if (!id) return null
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  )
}
