import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Space_Grotesk,
  Noto_Serif_JP,
  Noto_Sans_JP,
  Noto_Sans,
  Source_Code_Pro,
} from "next/font/google";
import "./globals.css";
import { THEME_COLOR } from "./theme-color";
import { OG_IMAGE, SITE_ORIGIN } from "@/lib/site";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const notoSerifJp = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  display: "swap",
  preload: false,
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});

// Cormorant・Noto Serif JP・Space Grotesk はアプリ本体では使わない(LP の lp.css と .wordmark のためだけに残す)。
// login-replace(作業 WUI の追補)の 5 面が使うデザインシステム Quiet Signal の字体
// (tokens.json type.families = Noto Sans / Noto Sans JP / Source Code Pro)。アプリ本体と 5 面と LP が使うので preload する。
const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "hareMa",
  description: "レストランをブックマークする日本語アプリ",
  // リンクを貼ったときのカード。ページごとの title・description は各ページの metadata が上書きする。
  openGraph: { type: "website", siteName: "hareMa", locale: "ja_JP", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

// ブラウザのツールバーの色。iOS 26 系はこれを読まないので、そちらは .edge-tint が受け持つ
// (globals.css)。Chrome / Android / iOS 18 以前にはこの 2 枚が効き続ける。
// width / initial-scale は Next.js 既定のままにする(ピンチズームを奪わない)。
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 6 つの変数は全部残す。cormorant / notoSerifJp / spaceGrotesk は LP の lp.css と globals.css の .wordmark が直に読む。
  return (
    <html
      lang="ja"
      className={`${cormorant.variable} ${spaceGrotesk.variable} ${notoSerifJp.variable} ${notoSansJp.variable} ${notoSans.variable} ${sourceCodePro.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="edge-tint edge-tint-top" />
        <div className="edge-tint edge-tint-bottom" />
        {children}
      </body>
    </html>
  );
}
