// 静的 import の WebP の型。next-env.d.ts は gitignore で、next build/dev の後にしか無い。無い clean な checkout でも pnpm typecheck が通るよう、同じ参照をここに置く。
/// <reference types="next/image-types/global" />
import Link from 'next/link'
import { getImageProps } from 'next/image'
import type { Metadata, Viewport } from 'next'
import { HOME_DESCRIPTION } from './_public/content'
import mapLight from './_public/lp/map-light.webp'
import mapDark from './_public/lp/map-dark.webp'
import mapR1Light from './_public/lp/map-r1-1b-light.webp'
import mapR1Dark from './_public/lp/map-r1-1b-dark.webp'
import appIconLight from './_public/lp/app-icon-light.webp'
import appIconDark from './_public/lp/app-icon-dark.webp'
import './lp.css'

export const metadata: Metadata = { title: 'hareMa', description: HOME_DESCRIPTION }

// ブラウザのツールバーの色を LP の地(Quiet Field の paper / ink)に合わせる。
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#171918' },
  ],
}

// アプリの画面の実機の撮影(架空のデータ・1170x2532 の WebP)。OS の色の設定で light / dark を替える(next/image の getImageProps の形)。
// 画像は .phone-in の中で 390x844 に置いてから transform で縮めるので、最適化を通さず(unoptimized)静的な配信のままにする。
const SHOTS = {
  'map-light': { light: mapLight, dark: mapDark },
  'map-r1-1b-light': { light: mapR1Light, dark: mapR1Dark },
} as const

function Shot({ name, alt, eager = false }: { name: keyof typeof SHOTS; alt: string; eager?: boolean }) {
  const common = { alt, width: 390, height: 844, unoptimized: true }
  const { props: light } = getImageProps({ ...common, src: SHOTS[name].light })
  const { props: dark } = getImageProps({ ...common, src: SHOTS[name].dark })
  return <picture><source media="(prefers-color-scheme: dark)" srcSet={dark.src} /><img className="app-shot" src={light.src} width={390} height={844} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" /></picture>
}

// iPhone アプリの公開前の枠(所有者の決定 2026-11-02 23:56 JST: 案 A と B の両方・A の QR の場所にはアプリのアイコン)。
// App Store の公式のバッジは公開か予約注文の後でないと使えないので、LP の線と字だけの枠にする。押せる物ではないのでリンクにしない。
function AppIcon() {
  const common = { alt: '', width: 80, height: 80, unoptimized: true }
  const { props: light } = getImageProps({ ...common, src: appIconLight })
  const { props: dark } = getImageProps({ ...common, src: appIconDark })
  return <picture className="app-icon"><source media="(prefers-color-scheme: dark)" srcSet={dark.src} /><img src={light.src} width={80} height={80} alt="" loading="lazy" decoding="async" /></picture>
}

export default function Home() {
  return (
<div className="lp bw qf">
<header className="lp-head lp-in">
<span className="wordmark">hareMa</span>
<nav className="lp-nav" aria-label="ページ">
<a href="#about">このアプリについて</a>
<Link href="/login">ログイン</Link>
</nav>
</header>

<main>
<section className="s1 lp-in" aria-labelledby="w-h1">
<div className="s1-text">
<h1 className="h1 hd" id="w-h1">散らばる店を、<wbr />ひとつの地図に。</h1>
<p className="lead hd"><span className="lb"><span className="nw">「行きたい」</span><wbr /><span className="nw">「また行きたい」</span></span><span className="lb">あなたが<wbr />訪れるべき<wbr />お店だけを<wbr />表示する</span><span className="lb">あなた専用の<wbr />地図が<wbr />作れる<wbr />アプリです。</span></p>
<div className="act">
<Link className="cta" href="/login">はじめる</Link>
<p className="act-note"><span className="nw">Apple または Google のアカウントで、</span><wbr /><span className="nw">ブラウザのまま始められます。</span></p>
<p className="act-note">無料で使えます。</p>
<p className="act-note dev-note hd"><span className="dev-mark" aria-hidden="true">※</span>開発中のため、<wbr />画面や機能は変わることがあります。</p>
<p className="app-dl app-dl-s1"><span className="app-dl-k">iPhone アプリ</span><span className="app-dl-v" lang="en">Coming soon</span></p>
</div>
</div>
<div className="s1-shot">
<div className="phone"><div className="phone-in">
<div className="app app-light">
<Shot name="map-light" eager alt="hareMa の地図の画面。検索欄、店舗とマップの切り替え、保存した店のピン(行きたい 16・また行きたい 8)が地図に並ぶ。" />
</div>
</div></div>
</div>
</section>

<section className="sec s2 lp-in" id="about" aria-labelledby="w-h2-use">
<h2 className="h2 hd" id="w-h2-use">使い方は、3 つだけ。</h2>
<div className="trio">
<div className="phone"><div className="phone-in">
<div className="app app-light" inert>
<Shot name="map-light" alt="" />
<div className="sh-scrim"></div>
<div className="sh" role="dialog" aria-label="保存する">
<div className="sh-top">
<div className="sh-grab"></div>
<div className="sh-name">喫茶 ことり</div>
<div className="sh-addr">東京都台東区谷中 3 丁目</div>
</div>
<div className="sh-flow">
<div className="sh-cap sh-cap-state">状態</div>
<div className="sh-seg" role="group" aria-label="状態"><button type="button" className="on" aria-pressed="true">行きたい</button><button type="button" aria-pressed="false">また行きたい</button><button type="button" aria-pressed="false">もういい</button></div>
<label className="sh-cap sh-cap-memo" htmlFor="w-memo">メモ</label>
<textarea id="w-memo" className="sh-field sh-memo" placeholder="気になったこと、行きたい理由など（任意）"></textarea>
<label className="sh-cap sh-cap-src" htmlFor="w-src">出典</label>
<input id="w-src" className="sh-field" type="text" placeholder="URL またはテキスト（任意）" />
<p className="sh-note">URL を貼ると、タイトルを自動で読み取ります（OGP）。</p>
</div>
<div className="sh-bottom">
<button className="sh-cta" type="button">保存する <span className="arrow">→</span></button>
</div>
</div>
</div>
</div></div>
<div className="phone"><div className="phone-in">
<div className="app app-light">
<Shot name="map-r1-1b-light" alt="hareMa の地図の画面。現在地のドットと、近くに保存した店のピン(行きたい 16・また行きたい 8)が並ぶ。" />
</div>
</div></div>
<div className="phone"><div className="phone-in">
<div className="app app-light" inert>
<Shot name="map-light" alt="" />
<div className="sh-scrim"></div>
<div className="sh sh-edit" role="dialog" aria-label="更新する">
<div className="sh-top">
<div className="sh-grab"></div>
<div className="sh-name">中華そば みやこ</div>
<div className="sh-addr">東京都文京区本郷 4 丁目</div>
</div>
<div className="sh-flow">
<div className="sh-seg" role="group" aria-label="状態"><button type="button" aria-pressed="false">行きたい</button><button type="button" className="on" aria-pressed="true">また行きたい</button><button type="button" aria-pressed="false">もういい</button></div>
<label className="sh-cap sh-cap-memo" htmlFor="w-memo-edit">メモ</label>
<textarea id="w-memo-edit" className="sh-field sh-memo" placeholder="気になったこと、行きたい理由など（任意）"></textarea>
<label className="sh-cap sh-cap-src" htmlFor="w-src-edit">出典</label>
<input id="w-src-edit" className="sh-field" type="text" placeholder="URL またはテキスト（任意）" />
<p className="sh-note">URL を貼ると、タイトルを自動で読み取ります（OGP）。</p>
</div>
<div className="sh-bottom">
<button className="sh-cta" type="button">更新する <span className="arrow">→</span></button>
<button className="sh-del" type="button">削除する</button>
</div>
</div>
</div>
</div></div>
</div>
<ol className="does">
<li><h3 className="h3 hd do-n"><span className="dn">01</span>保存する</h3><p className="do-t hd">気になった店を、<wbr />その場で保存。</p></li>
<li><h3 className="h3 hd do-n"><span className="dn">02</span>地図で見る</h3><p className="do-t hd">今いる場所の近くの<wbr /><span className="nw">行きたい店が、</span><wbr /><span className="nw">ピンで分かる。</span></p></li>
<li><h3 className="h3 hd do-n"><span className="dn">03</span>評価する</h3><p className="do-t hd">行ったら<wbr /><span className="nw">「また行きたい」か</span><wbr /><span className="nw">「もういい」を</span><wbr />自分で付ける。<wbr /><span className="nw">「もういい」は</span><wbr />地図から消える。</p></li>
</ol>
</section>

<section className="sec s3 lp-in" aria-labelledby="w-h2-diff">
<div className="s3-head">
<h2 className="h2 hd" id="w-h2-diff">もう、スクショやメモを<wbr /><span className="ln">探し回らなくていい。</span></h2>
</div>
<div className="s3-main">
<p className="body hd"><span className="nw">SNS で</span>保存したお店は、<wbr />地図に出ません。<wbr />地図アプリに保存し直しても、<wbr />見つけたリンクや理由は残りません。</p>
<p className="body hd">出先や <span className="nw">2 軒目を</span>探すときは、<wbr />二つのアプリを行き来して探し直します。</p>
<p className="body hd">行ったあとも、<wbr />お店は残ったままです。<wbr />もう行かないお店を一覧から外すには、<wbr />二つとも消し直す手間がかかります。</p>
<p className="body hd"><span className="nw">hareMa では、</span>お店を保存するときに、<wbr />見つけたリンクと理由のメモも残せます。<wbr /><span className="nw">「行きたい」と</span><span className="nw">「また行きたい」の</span><span className="nw">お店は、</span><wbr />地図に出るので、<wbr />近くのお店が分かります。</p>
<p className="body hd">行ったら<span className="nw">「もういい」に</span>分けるだけで、<wbr />そのお店は地図からすぐに消えます。<wbr />ほかの人の点数やおすすめは出しません。<wbr />地図に残るのは、<wbr />行くべきお店だけです。</p>
<h3 className="h3 hd sub">始める前に</h3>
<dl className="facts">
<div className="fact"><dt>データ</dt><dd>保存した店は、ほかの利用者には公開されません。退会すると、アカウントと保存した店を削除します。</dd></div>
<div className="fact"><dt>運営</dt><dd>hareMa 運営者。お問い合わせは <a href="https://x.com/htoranosuke" target="_blank" rel="noopener">X</a> で受け付けています。<span className="fact-links"><Link href="/terms">利用規約</Link><Link href="/privacy">プライバシーポリシー</Link></span></dd></div>
<div className="fact"><dt>アプリ</dt><dd><span className="hd"><span className="nw">ブラウザ版と iPhone のアプリを、</span><wbr />並行して作っています。<wbr /><span className="nw">ブラウザ版から順次公開予定です。</span></span><span className="app-dl app-dl-fact"><AppIcon /><span className="app-dl-text"><span className="app-soon" lang="en">Coming soon</span><wbr /><span className="app-note">App Store で公開予定です。</span></span></span></dd></div>
</dl>
<div className="act">
<Link className="cta" href="/login">はじめる</Link>
<p className="act-note"><span className="nw">Apple または Google のアカウントで、</span><wbr /><span className="nw">ブラウザのまま始められます。</span></p>
<p className="act-note">無料で使えます。</p>
</div>
</div>
</section>
</main>

<footer className="lp-foot lp-in">
<p className="act-note dev-note dev-foot hd"><span className="dev-mark" aria-hidden="true">※</span>hareMa は開発中です。<wbr /><span className="nw">画面や機能は、変わることがあります。</span></p>
<nav aria-label="フッター"><a href="https://x.com/htoranosuke" target="_blank" rel="noopener">お問い合わせ ↗</a><Link href="/terms">利用規約</Link><Link href="/privacy">プライバシーポリシー</Link></nav>
<span className="lp-copy">© hareMa</span>
</footer>
</div>
  )
}
