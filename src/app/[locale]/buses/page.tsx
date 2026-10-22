import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { listBuses } from "@/server/services/buses";
import { hotelOptions } from "@/server/services/hotels";
import { param, requireStaff } from "@/lib/utils/page";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";
import { DELAYED_ROW_STYLE, STATUS_BADGE_TONE, STATUS_KIND, STATUS_ROW_STYLE } from "@/lib/transport/status";

export default async function BusesPage({ params, searchParams }: PageProps<"/[locale]/buses">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const hotelId = param(sp.hotelId);
  const show = param(sp.show);
  const [t, td, ts, tt, page, hotels] = await Promise.all([
    getTranslations("buses"),
    getTranslations("directory"),
    getTranslations("busStatus"),
    getTranslations("trip"),
    listBuses(user, { q, cursor, hotelId, includeInactive: show === "all" }),
    hotelOptions(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={can(user, "bus.create") ? { href: "/buses/new", label: t("add") } : undefined} />
      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={[hotelId, show].filter(Boolean).length}>
        <FilterSelect name="hotelId" label={t("hotel")} value={hotelId} allLabel={td("all")} options={hotels.map((h) => ({ value: h.id, label: h.name }))} />
        <FilterSelect name="show" label={td("show")} value={show} allLabel={td("activeOnly")} options={[{ value: "all", label: td("includeInactive") }]} />
      </SearchForm>
      {page.items.length === 0 ? (
        <EmptyState>{td("noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((b) => {
            const trip = b.trips[0];
            const rowStyle = trip ? (trip.isDelayed ? DELAYED_ROW_STYLE : STATUS_ROW_STYLE[STATUS_KIND[trip.status]]) : "";
            return (
              <ListCard key={b.id} href={`/buses/${b.id}`} title={`🚌 ${b.label}`} className={rowStyle}>
                {b.registration && <span className="text-muted">{b.registration}</span>}
                <span>🏨 {b.hotel.name}</span>
                <span>{b.coordinator ? t("coordinatorIs", { name: b.coordinator.name }) : t("noCoordinator")}</span>
                <span>
                  {trip ? <Badge tone={STATUS_BADGE_TONE[STATUS_KIND[trip.status]]}>{ts(trip.status)}</Badge> : <Badge>{t("noTrip")}</Badge>}
                  {trip?.isDelayed && <Badge tone="danger">⚠ {tt("delayed")}</Badge>}
                </span>
                {!b.isActive && <Badge tone="danger">{td("inactive")}</Badge>}
              </ListCard>
            );
          })}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, hotelId, show }} />
    </section>
  );
}
