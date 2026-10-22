import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getOrgChart } from "@/server/services/org";
import { PageHeader } from "@/components/ui/Layout";
import { OrgTree } from "@/components/org/OrgTree";

/** Reporting-hierarchy view for staff and coordinators; attendees have no reporting chain to show. */
export default async function OrgChartPage({ params }: PageProps<"/[locale]/org">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER", "ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR"]);
  const [t, root] = await Promise.all([getTranslations("org"), getOrgChart(user)]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} />
      <p className="text-muted">{t("intro")}</p>
      <OrgTree root={root} />
    </section>
  );
}
