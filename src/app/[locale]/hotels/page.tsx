import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/policies";
import { listHotels, getHotelOccupancySummary } from "@/server/services/hotels";
import { clusterOptions } from "@/server/services/clusters";
import { param, requireStaff } from "@/lib/utils/page";
import { OCCUPANCY_ICON, type HotelOccupancyStatus } from "@/lib/hotels/occupancy";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";

const OCCUPANCY_STATUSES: HotelOccupancyStatus[] = ["full", "partial", "vacant", "noInventory"];
const OCCUPANCY_LABEL_KEY = {
  full: "occupancyFull",
  partial: "occupancyPartial",
  vacant: "occupancyVacant",
  noInventory: "occupancyNoInventory",
} as const satisfies Record<HotelOccupancyStatus, string>;

export default async function HotelsPage({ params, searchParams }: PageProps<"/[locale]/hotels">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const show = param(sp.show);
  const occupancyStatus = param(sp.occupancyStatus) as HotelOccupancyStatus | undefined;
  const clusterId = param(sp.clusterId);
  const [t, td, summary, page, clusters] = await Promise.all([
    getTranslations("hotels"),
    getTranslations("directory"),
    getHotelOccupancySummary(user),
    listHotels(user, { q, cursor, includeInactive: show === "all", occupancyStatus, clusterId }),
    clusterOptions(user),
  ]);

  const tiles: { key: HotelOccupancyStatus; label: string; value: number }[] = [
    { key: "full", label: t("occupancyFull"), value: summary.full },
    { key: "partial", label: t("occupancyPartial"), value: summary.partial },
    { key: "vacant", label: t("occupancyVacant"), value: summary.vacant },
  ];
  const occupancyFilters = [occupancyStatus, clusterId].filter(Boolean).length;

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={can(user, "hotel.create") ? { href: "/hotels/new", label: t("add") } : undefined} />

      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={`?occupancyStatus=${tile.key}`}
            className={`rounded-lg border-2 p-3 text-center ${occupancyStatus === tile.key ? "border-brand bg-orange-50" : "border-line"}`}
          >
            <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
            <p className="font-semibold">
              <span aria-hidden="true">{OCCUPANCY_ICON[tile.key]} </span>
              {tile.label}
            </p>
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
        <input type="hidden" name="q" value={q ?? ""} />
        <input type="hidden" name="show" value={show ?? ""} />
        <FilterSelect
          name="occupancyStatus"
          label={t("occupancyStatus")}
          value={occupancyStatus}
          allLabel={td("all")}
          options={OCCUPANCY_STATUSES.map((s) => ({ value: s, label: t(OCCUPANCY_LABEL_KEY[s]) }))}
        />
        <FilterSelect name="clusterId" label={t("cluster")} value={clusterId} allLabel={td("all")} options={clusters.map((c) => ({ value: c.id, label: c.name }))} />
        <button type="submit" className="min-h-12 px-5 rounded-lg bg-brand text-brand-ink text-lg font-semibold">
          🔍 {td("searchButton")}
        </button>
        {occupancyFilters > 0 && (
          <Link href="?" className="min-h-12 px-4 inline-flex items-center rounded-lg border-2 border-line font-semibold">
            {td("clear")}
          </Link>
        )}
      </form>

      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={show ? 1 : 0}>
        <input type="hidden" name="occupancyStatus" value={occupancyStatus ?? ""} />
        <input type="hidden" name="clusterId" value={clusterId ?? ""} />
        <FilterSelect name="show" label={td("show")} value={show} allLabel={td("activeOnly")} options={[{ value: "all", label: td("includeInactive") }]} />
      </SearchForm>

      {page.items.length === 0 ? (
        <EmptyState>{td("noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((h) => (
            <ListCard key={h.id} href={`/hotels/${h.id}`} title={h.name}>
              <span className="text-muted">{h.address}</span>
              <span>
                {h.coordinators.length > 0 ? (
                  t("coordinatorIs", { name: h.coordinators.map((c) => c.name).join(", ") })
                ) : (
                  <Badge tone="warn">⚠ {t("noCoordinator")}</Badge>
                )}
              </span>
              <span>{t("counts", { buses: h._count.buses, attendees: h._count.members })}</span>
              {!h.isActive && <Badge tone="danger">{td("inactive")}</Badge>}
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, show, occupancyStatus, clusterId }} />
    </section>
  );
}
