import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { listHotels } from "@/server/services/hotels";
import { param, requireStaff } from "@/lib/utils/page";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";

export default async function HotelsPage({ params, searchParams }: PageProps<"/[locale]/hotels">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const show = param(sp.show);
  const [t, td, page] = await Promise.all([
    getTranslations("hotels"),
    getTranslations("directory"),
    listHotels(user, { q, cursor, includeInactive: show === "all" }),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={can(user, "hotel.create") ? { href: "/hotels/new", label: t("add") } : undefined} />
      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={show ? 1 : 0}>
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
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, show }} />
    </section>
  );
}
