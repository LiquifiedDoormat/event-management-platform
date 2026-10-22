import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getClusterCoordinatorOverview } from "@/server/services/dashboard";
import { Badge, Section } from "@/components/ui/Layout";

// Read-only oversight: the coordinator's cluster, its hotels, each hotel's
// coordinators and counts. No edit controls — cluster coordinators can view,
// not modify, resources outside their own actions (there are none yet).
export default async function ClusterCoordinatorHome({ params }: PageProps<"/[locale]/cluster-coordinator">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["CLUSTER_COORDINATOR"]);
  const [t, tt, { cluster, hotels }] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("clusters"),
    getClusterCoordinatorOverview(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("welcome", { name: user.name })}</h1>

      <Section title={t("yourCluster")}>{cluster ? <p className="text-xl font-semibold">{cluster.name}</p> : <p>{t("noCluster")}</p>}</Section>

      {cluster && (
        <Section title={t("clusterHotels")}>
          {hotels.length === 0 ? (
            <p>{t("noClusterHotels")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {hotels.map((h) => (
                <li key={h.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                  <p className="text-lg font-semibold">{h.name}</p>
                  <p className="text-muted">{h.address}</p>
                  <p>{tt("hotelSummary", { buses: h.busCount, coordinators: h.coordinators.length })}</p>
                  {h.coordinators.length === 0 ? (
                    <Badge tone="warn">⚠ {tt("noCoordinators")}</Badge>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {h.coordinators.map((c) => (
                        <li key={c.phone}>
                          {c.name} ·{" "}
                          <a href={`tel:${c.phone}`} className="underline text-brand font-semibold">
                            📞 {c.phone}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </section>
  );
}
