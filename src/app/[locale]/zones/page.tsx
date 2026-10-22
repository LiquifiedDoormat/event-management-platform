import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { listZones } from "@/server/services/zones";
import { param, requireStaff } from "@/lib/utils/page";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";

export default async function ZonesPage({ params, searchParams }: PageProps<"/[locale]/zones">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const show = param(sp.show);
  const [t, td, page] = await Promise.all([
    getTranslations("zones"),
    getTranslations("directory"),
    listZones(user, { q, cursor, includeInactive: show === "all" }),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={can(user, "zone.create") ? { href: "/zones/new", label: t("add") } : undefined} />
      <p className="text-muted">{t("intro")}</p>
      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={show ? 1 : 0}>
        <FilterSelect name="show" label={td("show")} value={show} allLabel={td("activeOnly")} options={[{ value: "all", label: td("includeInactive") }]} />
      </SearchForm>
      {page.items.length === 0 ? (
        <EmptyState>{q ? td("noResults") : t("none")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((z) => (
            <ListCard key={z.id} href={`/zones/${z.id}`} title={z.name}>
              <span>{t("counts", { attendees: z.attendeeCount, gates: z.gateCount })}</span>
              {z.capacity != null && <span>{t("capacityLabel", { capacity: z.capacity })}</span>}
              {!z.isActive && <Badge tone="danger">{td("inactive")}</Badge>}
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, show }} />
    </section>
  );
}
