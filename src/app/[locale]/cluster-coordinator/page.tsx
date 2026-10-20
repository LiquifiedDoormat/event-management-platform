import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getClusterCoordinatorOverview } from "@/server/services/dashboard";
import { Section } from "@/components/ui/Layout";

// Minimal placeholder: read-only view of the coordinator's cluster and its
// hotels. The full operational dashboard (attendance, bus status) is later work.
export default async function ClusterCoordinatorHome({ params }: PageProps<"/[locale]/cluster-coordinator">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["CLUSTER_COORDINATOR"]);
  const [t, tc, { cluster, hotels }] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getClusterCoordinatorOverview(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("welcome", { name: user.name })}</h1>

      <Section title={t("yourCluster")}>
        {cluster ? (
          <>
            <p className="text-xl font-semibold">{cluster.name}</p>
            <p className="text-muted">{tc("comingSoon")}</p>
          </>
        ) : (
          <p>{t("noCluster")}</p>
        )}
      </Section>

      {cluster && (
        <Section title={t("clusterHotels")}>
          {hotels.length === 0 ? (
            <p>{t("noClusterHotels")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {hotels.map((h) => (
                <li key={h.id} className="rounded-lg border border-line p-3">
                  <p className="text-lg font-semibold">{h.name}</p>
                  <p className="text-muted">{h.address}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </section>
  );
}
