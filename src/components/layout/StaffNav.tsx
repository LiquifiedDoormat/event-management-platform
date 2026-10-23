"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type NavItem = { href: string; label: string; icon: string };

/**
 * Shared role navigation: a bottom bar on phones, a row under the header on
 * larger screens. Icons always have a text label. Used by every signed-in
 * role that needs more than one destination — see StaffNav, CoordinatorNav
 * and ClusterCoordinatorNav below for the per-role item lists.
 */
export function RoleNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="fixed bottom-0 inset-x-0 z-10 border-t border-line bg-surface sm:static sm:border-t-0 sm:border-b"
    >
      {/* More items than comfortably fit a phone width: scroll horizontally rather than shrink icons unreadably. */}
      <ul className="mx-auto max-w-3xl flex overflow-x-auto sm:max-w-none sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-4 sm:py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-shrink-0 basis-1/5 sm:basis-auto">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-0.5 text-xs tracking-tight font-semibold sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-md sm:px-3 sm:text-base ${
                  active ? "text-brand bg-orange-50" : "text-ink"
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

/** Owner/Admin navigation. */
export function StaffNav({ home }: { home: string }) {
  const t = useTranslations("nav");
  const items: NavItem[] = [
    { href: home, label: t("home"), icon: "🏠" },
    { href: "/ops", label: t("ops"), icon: "🛫" },
    { href: "/hotels", label: t("hotels"), icon: "🏨" },
    { href: "/clusters", label: t("clusters"), icon: "🗺️" },
    { href: "/zones", label: t("zones"), icon: "🎪" },
    { href: "/buses", label: t("buses"), icon: "🚌" },
    { href: "/coordinators", label: t("coordinators"), icon: "🧑‍✈️" },
    { href: "/people", label: t("people"), icon: "👥" },
    { href: "/import", label: t("import"), icon: "📥" },
    { href: "/org", label: t("org"), icon: "🪪" },
  ];
  return <RoleNav items={items} label={t("label")} />;
}

/** Hotel coordinator navigation: their own home, their guests, the org chart. */
export function CoordinatorNav() {
  const t = useTranslations("nav");
  const items: NavItem[] = [
    { href: "/coordinator", label: t("home"), icon: "🏠" },
    { href: "/coordinator/people", label: t("myGuests"), icon: "👥" },
    { href: "/org", label: t("org"), icon: "🪪" },
  ];
  return <RoleNav items={items} label={t("label")} />;
}

/** Cluster coordinator navigation: their own (read-only) home, the ops board (their cluster only) and the org chart. */
export function ClusterCoordinatorNav() {
  const t = useTranslations("nav");
  const items: NavItem[] = [
    { href: "/cluster-coordinator", label: t("home"), icon: "🏠" },
    { href: "/ops", label: t("ops"), icon: "🛫" },
    { href: "/org", label: t("org"), icon: "🪪" },
  ];
  return <RoleNav items={items} label={t("label")} />;
}
