import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { LanguageSwitcher, LanguageSwitcherWithQuery } from "@/components/layout/LanguageSwitcher";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StaffNav } from "@/components/layout/StaffNav";
import { roleHome } from "@/server/services/auth";
import { getCurrentUser } from "@/lib/auth/current-user";
import "../globals.css";

const latin = Noto_Sans({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
});

const CLIENT_NAMESPACES = ["common", "auth", "nav", "forms", "errors", "busStatus", "transport", "trip"] as const;

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("appName") };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const user = await getCurrentUser();
  // Only the namespaces client components use are sent to the browser.
  const all = await getMessages();
  const clientMessages = Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, all[ns]]));

  return (
    <html lang={locale} className={`${latin.variable} ${devanagari.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <NextIntlClientProvider messages={clientMessages}>
          <SkipLink />
          <header className="border-b border-line px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <AppName />
            <div className="flex flex-wrap items-center gap-2">
              <Suspense fallback={<LanguageSwitcher />}>
                <LanguageSwitcherWithQuery />
              </Suspense>
              {user && <ProfileLink />}
              {user && <SignOutButton />}
            </div>
          </header>
          {user && (user.role === "OWNER" || user.role === "ADMIN") && <StaffNav home={roleHome(user.role)} />}
          {/* Bottom padding keeps content clear of the fixed mobile nav bar. */}
          <main id="main" tabIndex={-1} className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 pb-28 sm:pb-6 outline-none">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

async function SkipLink() {
  const t = await getTranslations("common");
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-3 focus:text-brand-ink"
    >
      {t("skipToContent")}
    </a>
  );
}

async function ProfileLink() {
  const t = await getTranslations("profile");
  return (
    <Link href="/profile" className="min-h-11 px-3 inline-flex items-center rounded-md border border-line text-base font-semibold">
      <span aria-hidden="true">👤&nbsp;</span>
      {t("title")}
    </Link>
  );
}

async function AppName() {
  const t = await getTranslations("common");
  return <span className="text-lg font-bold">{t("appName")}</span>;
}
