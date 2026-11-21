import type { Metadata, Viewport } from "next";
import { en } from "@harema/shared/i18n";
import { RootShell, rootMetadata, rootViewport } from "@/app/_shell/root-shell";

// 英語の公開ページ(/en・/en/news・/en/terms・/en/privacy)の root layout。言語は要求から決めない(静的のまま)。
// description と og:locale は英語にする(rootMetadata は日本語の値を持つ)。openGraph は浅く置き換わるので、画像などは rootMetadata から引き継ぐ。
export const metadata: Metadata = {
  ...rootMetadata,
  description: en.web.site.description,
  openGraph: { ...rootMetadata.openGraph, locale: "en_US" },
};
export const viewport: Viewport = rootViewport;

export default function EnSiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootShell lang="en">{children}</RootShell>;
}
