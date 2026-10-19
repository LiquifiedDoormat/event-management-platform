"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

const LANGUAGES = [
  { locale: "en", label: "English" },
  { locale: "hi", label: "हिन्दी" },
] as const;

/** Language buttons. `search` keeps filters/pagination when switching. */
export function LanguageSwitcher({ search = "" }: { search?: string }) {
  const t = useTranslations("common");
  const current = useLocale();
  const pathname = usePathname();
  const href = search ? `${pathname}?${search}` : pathname;

  return (
    <nav aria-label={t("language")} className="flex gap-2">
      {LANGUAGES.map(({ locale, label }) => (
        <Link
          key={locale}
          href={href}
          locale={locale}
          lang={locale}
          aria-current={current === locale ? "true" : undefined}
          className={`min-h-11 min-w-11 px-3 inline-flex items-center justify-center rounded-md border text-base font-semibold ${
            current === locale ? "bg-brand text-brand-ink border-brand" : "border-line"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Reads the query string; render inside <Suspense> with <LanguageSwitcher /> as fallback. */
export function LanguageSwitcherWithQuery() {
  return <LanguageSwitcher search={useSearchParams().toString()} />;
}
