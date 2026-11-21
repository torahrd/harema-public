import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { RootShell, rootMetadata, rootViewport } from "@/app/_shell/root-shell";

// アプリの画面(ログイン・Onboarding・地図・一覧・詳細)の root layout。
// 言語は next-intl の要求の設定(src/i18n/request.ts)が Accept-Language から決める。
export const viewport: Viewport = rootViewport;

// 検索とリンクのカードの文と openGraph.locale は表示言語に合わせる(画面には出ない)。
const OG_LOCALE = { ja: "ja_JP", en: "en_US" } as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("web.site");
  return {
    ...rootMetadata,
    description: t("description"),
    openGraph: { ...rootMetadata.openGraph, locale: OG_LOCALE[locale as keyof typeof OG_LOCALE] ?? OG_LOCALE.ja },
  };
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  // messages と locale は request.ts の設定から引き継がれる(client の部品が useTranslations で読む)。
  return (
    <RootShell lang={locale}>
      <NextIntlClientProvider>{children}</NextIntlClientProvider>
    </RootShell>
  );
}
