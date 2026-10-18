import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import "../globals.css";

const latin = Noto_Sans({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
});

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("appName") };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${latin.variable} ${devanagari.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <NextIntlClientProvider>
          <header className="border-b border-line px-4 py-3 flex items-center justify-between gap-4">
            <AppName />
            <LanguageSwitcher />
          </header>
          <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

async function AppName() {
  const t = await getTranslations("common");
  return <span className="text-lg font-bold">{t("appName")}</span>;
}
