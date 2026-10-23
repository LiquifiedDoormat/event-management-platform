import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { getOpsDashboard } from "@/server/services/dashboard";
import { hotelOptions } from "@/server/services/hotels";
import { clusterOptions } from "@/server/services/clusters";
import { requireUser } from "@/lib/auth/current-user";
import { param } from "@/lib/utils/page";
import { DELAYED_ROW_STYLE, STATUS_BADGE_TONE, STATUS_ICON, STATUS_ROW_STYLE, type StatusKind } from "@/lib/transport/status";
import { PageHeader, Badge, EmptyState } from "@/components/ui/Layout";
import { FilterSelect } from "@/components/ui/Directory";
import { AutoRefresh } from "@/components/ui/AutoRefresh";

const KINDS: StatusKind[] = ["boarding", "moving", "arrived"];

/**
 * Owner/Admin see the whole event, unfiltered-option dropdowns included.
 * Cluster coordinators (added so they can watch their own cluster's buses
 * live, same as staff do fleet-wide) get the same page and queries, but
 * `getOpsDashboard` scopes `summary`/`buses` to their cluster and we use its
 * derived, already-scoped `hotelOptions`/`clusterOptions` for the filter
 * dropdowns instead of the staff-only, unscoped `hotelOptions`/`clusterOptions`
 * services — so the filters never offer another cluster's hotels either.
 */
export default async function OpsPage({ params, searchParams }: PageProps<"/[locale]/ops">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER", "ADMIN", "CLUSTER_COORDINATOR"]);
  const isStaff = user.role === "OWNER" || user.role === "ADMIN";
  if (isStaff && !user.eventId) redirect({ href: "/events", locale });
  const sp = await searchParams;
  const statusKind = param(sp.status) as StatusKind | "notRunning" | undefined;
  const hotelId = param(sp.hotelId);
  const clusterId = param(sp.clusterId);
  const delayedOnly = param(sp.delayed) === "1";

  const dashboard = await getOpsDashboard(user, { statusKind, hotelId, clusterId, delayedOnly });
  const { summary, buses } = dashboard;
  const [t, td, ts, hotels, clusters] = await Promise.all([
    getTranslations("ops"),
    getTranslations("directory"),
    getTranslations("busStatus"),
    isStaff ? hotelOptions(user) : Promise.resolve(dashboard.hotelOptions),
    isStaff ? clusterOptions(user) : Promise.resolve(dashboard.clusterOptions),
  ]);

  const tiles: { key: StatusKind | "notRunning"; label: string; value: number }[] = [
    { key: "boarding", label: t("boarding"), value: summary.boarding },
    { key: "moving", label: t("moving"), value: summary.moving },
    { key: "arrived", label: t("arrived"), value: summary.arrived },
    { key: "notRunning", label: t("notRunning"), value: summary.notRunning },
  ];

  const activeFilters = [statusKind, hotelId, clusterId, delayedOnly ? "1" : undefined].filter(Boolean).length;

  return (
    <section className="flex flex-col gap-5">
      <AutoRefresh />
      <PageHeader title={t("title")} />
      <p className="text-muted">
        {t("total")}: <span className="font-semibold tabular-nums">{summary.total}</span> · ⚠ {t("delayed")}:{" "}
        <span className="font-semibold tabular-nums">{summary.delayed}</span> · {t("autoRefresh")}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={`?status=${tile.key}`}
            className={`rounded-lg border-2 p-3 text-center ${statusKind === tile.key ? "border-brand bg-orange-50" : "border-line"}`}
          >
            <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
            <p className="font-semibold">
              {tile.key !== "notRunning" && <span aria-hidden="true">{STATUS_ICON[tile.key]} </span>}
              {tile.label}
            </p>
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
        <FilterSelect
          name="status"
          label={t("status")}
          value={statusKind}
          allLabel={t("allStatuses")}
          options={[...KINDS, "notRunning" as const].map((k) => ({ value: k, label: t(k) }))}
        />
        <FilterSelect name="hotelId" label={t("hotel")} value={hotelId} allLabel={td("all")} options={hotels.map((h) => ({ value: h.id, label: h.name }))} />
        <FilterSelect name="clusterId" label={t("cluster")} value={clusterId} allLabel={td("all")} options={clusters.map((c) => ({ value: c.id, label: c.name }))} />
        <label className="flex items-center gap-2 min-h-12 font-semibold">
          <input key={String(delayedOnly)} type="checkbox" name="delayed" value="1" defaultChecked={delayedOnly} className="h-5 w-5" />
          {t("delayedOnly")}
        </label>
        <button type="submit" className="min-h-12 px-5 rounded-lg bg-brand text-brand-ink text-lg font-semibold">
          🔍 {td("searchButton")}
        </button>
        {activeFilters > 0 && (
          <Link href="?" className="min-h-12 px-4 inline-flex items-center rounded-lg border-2 border-line font-semibold">
            {td("clear")}
          </Link>
        )}
      </form>

      {buses.length === 0 ? (
        <EmptyState>{t("noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {buses.map((b) => {
            const rowStyle = b.isDelayed ? DELAYED_ROW_STYLE : b.status ? STATUS_ROW_STYLE[b.kind as StatusKind] : "border-line";
            return (
              <li key={b.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 p-3 ${rowStyle}`}>
                <span className="font-semibold min-w-28">🚌 {b.label}</span>
                <span className="text-muted">🏨 {b.hotelName}</span>
                {b.clusterName && <span className="text-muted">🗺️ {b.clusterName}</span>}
                <span className="text-muted">{b.coordinatorName ?? t("noCoordinator")}</span>
                <span className="ml-auto flex items-center gap-2">
                  {b.status ? (
                    <Badge tone={STATUS_BADGE_TONE[b.kind as StatusKind]}>
                      <span aria-hidden="true">{STATUS_ICON[b.kind as StatusKind]} </span>
                      {ts(b.status)}
                    </Badge>
                  ) : (
                    <Badge>{t("notRunning")}</Badge>
                  )}
                  {b.isDelayed && <Badge tone="danger">⚠ {t("delayed")}</Badge>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
