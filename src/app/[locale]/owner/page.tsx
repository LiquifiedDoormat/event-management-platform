import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getEventOverview } from "@/server/services/dashboard";
import { EventOverview } from "@/components/layout/EventOverview";
import { Link } from "@/i18n/navigation";

export default async function OwnerHome({ params }: PageProps<"/[locale]/owner">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER"]);
  const [t, overview] = await Promise.all([getTranslations("dashboard"), getEventOverview(user)]);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("ownerTitle")}</h1>
      <p className="text-lg">{t("welcome", { name: user.name })}</p>
      <EventOverview overview={overview} />
      <nav aria-label={t("ownerTools")} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/owner/audit" className="min-h-14 inline-flex items-center rounded-lg border-2 border-brand px-4 text-lg font-semibold text-brand">
          <span aria-hidden="true">📜&nbsp;</span>
          {t("auditLog")}
        </Link>
        <Link href="/owner/settings" className="min-h-14 inline-flex items-center rounded-lg border-2 border-brand px-4 text-lg font-semibold text-brand">
          <span aria-hidden="true">⚙️&nbsp;</span>
          {t("eventSettings")}
        </Link>
      </nav>
    </section>
  );
}
