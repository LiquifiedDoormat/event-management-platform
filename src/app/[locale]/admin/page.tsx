import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getEventOverview } from "@/server/services/dashboard";
import { EventOverview } from "@/components/layout/EventOverview";

export default async function AdminHome({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["ADMIN"]);
  const [t, overview] = await Promise.all([getTranslations("dashboard"), getEventOverview(user)]);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("adminTitle")}</h1>
      <p className="text-lg">{t("welcome", { name: user.name })}</p>
      <EventOverview overview={overview} />
    </section>
  );
}
