"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Owner/Admin navigation: a bottom bar on phones, a row under the header on
 * larger screens. Icons always have a text label.
 */
export function StaffNav({ home }: { home: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const items = [
    { href: home, label: t("home"), icon: "🏠" },
    { href: "/hotels", label: t("hotels"), icon: "🏨" },
    { href: "/buses", label: t("buses"), icon: "🚌" },
    { href: "/coordinators", label: t("coordinators"), icon: "🧑‍✈️" },
    { href: "/people", label: t("people"), icon: "👥" },
    { href: "/import", label: t("import"), icon: "📥" },
  ];

  return (
    <nav
      aria-label={t("label")}
      className="fixed bottom-0 inset-x-0 z-10 border-t border-line bg-surface sm:static sm:border-t-0 sm:border-b"
    >
      <ul className="mx-auto max-w-3xl grid grid-cols-6 sm:flex sm:gap-2 sm:px-4 sm:py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-0.5 text-xs tracking-tight font-semibold sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-md sm:px-3 sm:text-base ${
                  active ? "text-brand bg-blue-50" : "text-ink"
                }`}
              >
                <span aria-hidden="true" className="text-xl sm:text-base">
                  {item.icon}
                </span>
                <span className="max-w-full text-center leading-tight hyphens-auto break-words">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
