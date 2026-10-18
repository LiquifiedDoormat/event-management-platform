import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getEventOverview } from "@/server/services/dashboard";
import { EventOverview } from "@/components/layout/EventOverview";

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
    </section>
  );
}
