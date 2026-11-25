// 静的 import の WebP の型。next-env.d.ts は gitignore で、next build/dev の後にしか無い。無い clean な checkout でも pnpm typecheck が通るよう、同じ参照をここに置く。
/// <reference types="next/image-types/global" />
import Link from 'next/link'
import { getImageProps } from 'next/image'
import mapLight from '@/app/_public/lp/map-light.webp'
import mapDark from '@/app/_public/lp/map-dark.webp'
import mapR1Light from '@/app/_public/lp/map-r1-1b-light.webp'
import mapR1Dark from '@/app/_public/lp/map-r1-1b-dark.webp'
import sheetSaveLight from '@/app/_public/lp/sheet-save-light.webp'
import sheetSaveDark from '@/app/_public/lp/sheet-save-dark.webp'
import sheetRateLight from '@/app/_public/lp/sheet-rate-light.webp'
import sheetRateDark from '@/app/_public/lp/sheet-rate-dark.webp'
import appIcon from '@/app/_public/lp/app-icon.webp'
import appStoreBadgeJa from '@/app/_public/lp/app-store-badge-ja.svg'
// 英語のページは Apple の英語のバッジ(Download on the App Store・Apple Marketing Tools の en-us の黒・2026-11-21 取得)。バッジは表示の言語に合わせる(Apple の App Store のマーケティングのガイドライン)
import appStoreBadgeEn from '@/app/_public/lp/app-store-badge-en.svg'
import appStoreQr from '@/app/_public/lp/app-store-qr.svg'
import { SiteAnalytics } from '@/app/_public/site-analytics'
import { LpNotice } from '@/app/_public/lp-notice'
import { LpClock } from '@/app/_public/lp-clock'
import { LangLinks } from '@/app/_public/lang-links'
import { NEWS, LP_NEWS_COUNT, newsDateTime, newsText } from '@/app/_public/news'
import { NewsSentence } from '@/app/_public/news-sentence'
import { Rich } from '@/app/_public/rich'
import { CONTACT_MAILTO, OPERATOR_X_URL } from '@/app/_public/content'
import { publicCopy, type PublicLocale } from '@/app/_public/copy'
import '@/app/lp.css'

// アプリの画面(実物の地図に今のアプリの部品を重ねた合成。tools/lp-shots・架空のデータ・1170x2532 の WebP)。OS の色の設定で light / dark を替える(next/image の getImageProps の形)。
// 画像は .phone-in の中で 390x844 に置いてから transform で縮めるので、最適化を通さず(unoptimized)静的な配信のままにする。
// 英語の頁も同じ画像(画像の中の文字は日本語のまま。所有者の決定・harema#150)。
const SHOTS = {
  'map-light': { light: mapLight, dark: mapDark },
  'map-r1-1b-light': { light: mapR1Light, dark: mapR1Dark },
  'sheet-save-light': { light: sheetSaveLight, dark: sheetSaveDark },
  'sheet-rate-light': { light: sheetRateLight, dark: sheetRateDark },
} as const

function Shot({ name, alt, eager = false }: { name: keyof typeof SHOTS; alt: string; eager?: boolean }) {
  const common = { alt, width: 390, height: 844, unoptimized: true }
  const { props: light } = getImageProps({ ...common, src: SHOTS[name].light })
  const { props: dark } = getImageProps({ ...common, src: SHOTS[name].dark })
  return <picture><source media="(prefers-color-scheme: dark)" srcSet={dark.src} /><img className="app-shot" src={light.src} width={390} height={844} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" /></picture>
}

// iPhone アプリ(App Store で公開 2026-11-07)。バッジは Apple の配布の物をそのまま(日本語版・黒・高さ 40px 以上・周りの余白は高さの 1/4 以上・1 つの画面構成に 1 つなので LP では段 1 の 1 か所だけ。所有者の決定 2026-11-07 案「上」)。
// 英語の頁のバッジは、Apple の英語版の決まりの原文を読めていないので、日本語版のまま(替えるのは原文を読んでから。PR4 の M3)。
// QR はアプリのページの URL を符号にした物(PC の幅だけ。スマホの画面の QR はその端末で読めない)。
const APP_STORE_URL = 'https://apps.apple.com/jp/app/harema/id6830447181'

function AppStoreBadge({ className, alt, locale }: { className: string; alt: string; locale: PublicLocale }) {
  const width = locale === 'en' ? 120 : 109
  const { props } = getImageProps({ alt, width, height: 40, unoptimized: true, src: locale === 'en' ? appStoreBadgeEn : appStoreBadgeJa })
  return <a className={className} href={APP_STORE_URL} target="_blank" rel="noopener"><picture><img src={props.src} width={width} height={40} alt={alt} /></picture></a>
}

// アイコンはアプリと同じ「椀に昇る日と海」(harema#26・PR #69)。ライトもダークも同じ暗い地の絵なので 1 枚。
function AppIcon() {
  const { props } = getImageProps({ alt: '', width: 80, height: 80, unoptimized: true, src: appIcon })
  return <picture className="app-icon"><img src={props.src} width={80} height={80} alt="" loading="lazy" decoding="async" /></picture>
}

// PC の幅だけ出す QR(app-store-qr.svg は segno で APP_STORE_URL を符号にした物・誤り訂正 M・周りに 4 マス)。
function AppQr() {
  const { props } = getImageProps({ alt: '', width: 96, height: 96, unoptimized: true, src: appStoreQr })
  return <picture className="app-qr"><img src={props.src} width={96} height={96} alt="" loading="lazy" decoding="async" /></picture>
}

/**
 * LP の本体(`/` と `/en`)。文は copy/{ja,en}.ts、言語は引数。頁(page.tsx)は metadata を持つ。
 * 英語の頁は、ログアウト・退会の後の知らせ(LpNotice)を出さない(印は日本語の LP が読む。英語の頁へは戻らない)。
 */
export function HomeView({ locale }: { locale: PublicLocale }) {
  const c = publicCopy(locale)
  const h = c.home
  const home = locale === 'en' ? '/en' : '/'
  const xLink = (label: string) => <a className="x-ul" href={OPERATOR_X_URL} target="_blank" rel="noopener">{label}</a>
  const mailLink = (label: string) => <a className="x-ul" href={CONTACT_MAILTO}>{label}</a>
  const act = (
    <div className="act">
      <Link className="cta" href="/login" prefetch={false}>{h.cta}</Link>
      <p className="act-note"><Rich text={h.actNote} /></p>
      <p className="act-note">{h.actFree}</p>
    </div>
  )
  return (
<div className="lp bw qf">
<header className="lp-head lp-in">
<span className="wordmark">hareMa</span>
<nav className="lp-nav" aria-label={c.nav.pageLabel}>
<a href="#about">{c.nav.about}</a>
<Link href="/login" prefetch={false}>{c.nav.login}</Link>
</nav>
</header>
{locale === 'ja' && <LpNotice />}

<main>
<section className="s1 lp-in" aria-labelledby="w-h1">
<div className="s1-text">
<LpClock />
<h1 className="h1 hd" id="w-h1"><Rich text={h.h1} /></h1>
<p className="lead hd">{h.lead.map((line) => <span className="lb" key={line}><Rich text={line} /></span>)}</p>
<div className="act">
<Link className="cta" href="/login" prefetch={false}>{h.cta}</Link>
<p className="act-note"><Rich text={h.actNote} /></p>
<p className="act-note">{h.actFree}</p>
<AppStoreBadge className="app-badge app-badge-s1" alt={h.appStoreAlt} locale={locale} />
</div>
</div>
<div className="s1-shot">
<div className="phone"><div className="phone-in">
<div className="app app-light">
<Shot name="map-light" eager alt={h.shotMapAlt} />
</div>
</div></div>
</div>
</section>

<section className="sec s2 lp-in" id="about" aria-labelledby="w-h2-use">
<h2 className="h2 hd" id="w-h2-use">{h.useHeading}</h2>
<div className="trio">
<div className="phone"><div className="phone-in">
<div className="app app-light">
<Shot name="sheet-save-light" alt="" />
</div>
</div></div>
<div className="phone"><div className="phone-in">
<div className="app app-light">
<Shot name="map-r1-1b-light" alt={h.shotNearbyAlt} />
</div>
</div></div>
<div className="phone"><div className="phone-in">
<div className="app app-light">
<Shot name="sheet-rate-light" alt="" />
</div>
</div></div>
</div>
<ol className="does">
{h.steps.map((step) => <li key={step.no}><h3 className="h3 hd do-n"><span className="dn">{step.no}</span>{step.name}</h3><p className="do-t hd"><Rich text={step.text} /></p></li>)}
</ol>
</section>

<section className="sec s3 lp-in" aria-labelledby="w-h2-diff">
<div className="s3-head">
<h2 className="h2 hd" id="w-h2-diff"><Rich text={h.diffHeading} /></h2>
</div>
<div className="s3-main">
{h.diffBody.map((text) => <p className="body hd" key={text}><Rich text={text} /></p>)}
<h3 className="h3 hd sub">{h.beforeHeading}</h3>
<dl className="facts">
<div className="fact"><dt>{h.facts.login.name}</dt><dd><span className="hd"><Rich text={h.facts.login.text} /></span></dd></div>
<div className="fact"><dt>{h.facts.data.name}</dt><dd className="hd"><Rich text={h.facts.data.text} /></dd></div>
<div className="fact"><dt>{h.facts.operator.name}</dt><dd><Rich text={h.facts.operator.text} slots={{ mail: mailLink(h.facts.operator.mailLabel), x: xLink(h.facts.operator.xLabel) }} /><span className="fact-links"><Link href={locale === 'en' ? '/en/terms' : '/terms'}>{c.nav.terms}</Link><Link href={locale === 'en' ? '/en/privacy' : '/privacy'}>{c.nav.privacy}</Link></span></dd></div>
<div className="fact"><dt>{h.facts.app.name}</dt><dd><span className="hd"><Rich text={h.facts.app.text} /></span><span className="app-get"><AppIcon /><AppQr /><span className="app-get-text"><a className="x-ul" href={APP_STORE_URL} target="_blank" rel="noopener">{h.facts.app.storeLink}</a><span className="app-qr-note"><Rich text={h.facts.app.qrNote} /></span></span></span><span className="hd app-android"><Rich text={h.facts.app.android} /></span></dd></div>
</dl>
{act}
<div>
<h3 className="h3 hd sub">{h.newsHeading}</h3>
<ol className="nws-list" data-lp-feed="news">{NEWS.slice(0, LP_NEWS_COUNT).map((item) => { const { title, texts } = newsText(item, locale); return <li className="nws-item" key={`${item.date}-${item.targets.join()}-${item.title}`}><p className="nws-meta"><time className="nws-date" dateTime={newsDateTime(item.date)}>{item.date}</time>{item.targets.map((t) => <span className="nws-tag" key={t}>{t}</span>)}</p><div className="nws-t hd"><p className="nws-ttl">{title}</p>{texts.length > 1 ? <ul className="nws-ul">{texts.map((text) => <li key={text}><NewsSentence text={text} locale={locale} /></li>)}</ul> : texts.map((text) => <p className="nws-d" key={text}><NewsSentence text={text} locale={locale} /></p>)}</div></li> })}</ol>
<p className="nws-all"><Link className="x-ul" href={locale === 'en' ? '/en/news' : '/news'}>{h.newsAll}</Link></p>
</div>
</div>
</section>
</main>

<footer className="lp-foot lp-in">
<nav aria-label={c.nav.footerLabel}><a href={CONTACT_MAILTO}>{c.nav.contactMail}</a><Link href={locale === 'en' ? '/en/terms' : '/terms'}>{c.nav.terms}</Link><Link href={locale === 'en' ? '/en/privacy' : '/privacy'}>{c.nav.privacy}</Link><LangLinks locale={locale} path={home} /></nav>
<span className="lp-copy">© hareMa</span>
<p className="lp-credit"><Rich text={h.credit} /></p>
</footer>
<SiteAnalytics />
</div>
  )
}
