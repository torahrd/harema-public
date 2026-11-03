import Script from 'next/script'
import { analyticsEnv } from '@/env/analytics'
import { PUBLIC_ANALYTICS_PATHS } from '@/lib/site'

/**
 * 公開ページ(LP・利用規約・プライバシーポリシー・Coming soon)だけに置く Google アナリティクス 4 の部品
 * (所有者の決定 2026-11-03 12:13 JST)。ログインの後の画面の URL(店の識別子を含む `/places/...` など)を
 * Google へ送らない(プライバシーポリシー第 5 条 1 項)。そのための 2 段:
 * 1. 公開ページからログインへのリンクは素の `<a>` にして、文書ごと読み直す(タグの残った文書で
 *    ログイン後の画面へ進まない)。
 * 2. それでも同じ文書のままログイン後の画面へ移ったとき(ログイン画面から公開ページへ寄った後の戻る・
 *    router.replace など)のために、
 *    Google の公式の止め方 `window['ga-disable-<ID>']` を、公開ページの外では true にする。履歴の変化に
 *    Google の部品より先に反応するよう、見張りを置いてから gtag.js を読み込む。
 * 測定 ID が無い build(local・Preview の既定)では何も出さない。
 * ID は env の検証で `G-` + 英大文字と数字に限っているので、下の文字列に埋めても式を壊さない。
 */
export function SiteAnalytics() {
  const id = analyticsEnv.gaMeasurementId
  if (!id) return null
  const publicPaths = JSON.stringify(PUBLIC_ANALYTICS_PATHS)
  const init = `(function(){
var id='${id}',key='ga-disable-'+id,pub=${publicPaths};
function upd(){window[key]=pub.indexOf(location.pathname)<0;}
upd();
if(!window.__haremaGaGuard){window.__haremaGaGuard=1;
['pushState','replaceState'].forEach(function(m){var o=history[m];history[m]=function(){var r=o.apply(this,arguments);upd();return r;};});
addEventListener('popstate',upd);}
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};
gtag('js',new Date());gtag('config',id);
var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+id;document.head.appendChild(s);
})();`
  return (
    <Script id="ga4-init" strategy="afterInteractive">
      {init}
    </Script>
  )
}
