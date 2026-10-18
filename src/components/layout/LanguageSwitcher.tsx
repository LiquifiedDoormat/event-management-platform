"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LANGUAGES = [
  { locale: "en", label: "English" },
  { locale: "hi", label: "हिन्दी" },
] as const;

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("language")} className="flex gap-2">
      {LANGUAGES.map(({ locale, label }) => (
        <Link
          key={locale}
          href={pathname}
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
