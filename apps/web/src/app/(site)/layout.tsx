import type { Metadata, Viewport } from "next";
import { RootShell, rootMetadata, rootViewport } from "@/app/_shell/root-shell";

// 公開ページ(LP・/news・/terms・/privacy ほか)の root layout。言語は要求から決めない(静的のまま)。
export const metadata: Metadata = rootMetadata;
export const viewport: Viewport = rootViewport;

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootShell lang="ja">{children}</RootShell>;
}
