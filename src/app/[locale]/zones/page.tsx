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
  const fullnessParam = param(sp.fullness);
  const fullness = fullnessParam === "full" || fullnessParam === "partial" || fullnessParam === "empty" ? fullnessParam : undefined;
  const [t, td, page] = await Promise.all([
    getTranslations("zones"),
    getTranslations("directory"),
    listZones(user, { q, cursor, includeInactive: show === "all", fullness }),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={can(user, "zone.create") ? { href: "/zones/new", label: t("add") } : undefined} />
      <p className="text-muted">{t("intro")}</p>
      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={(show ? 1 : 0) + (fullness ? 1 : 0)}>
        <FilterSelect name="show" label={td("show")} value={show} allLabel={td("activeOnly")} options={[{ value: "all", label: td("includeInactive") }]} />
        <FilterSelect
          name="fullness"
          label={t("fullness")}
          value={fullness}
          allLabel={t("fullnessAll")}
          options={[
            { value: "full", label: t("fullnessFull") },
            { value: "partial", label: t("fullnessPartial") },
            { value: "empty", label: t("fullnessEmpty") },
          ]}
        />
      </SearchForm>
      {page.items.length === 0 ? (
        <EmptyState>{q || fullness ? td("noResults") : t("none")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((z) => (
            <ListCard key={z.id} href={`/zones/${z.id}`} title={z.name}>
              <span>{t("counts", { attendees: z.attendeeCount, gates: z.gateCount })}</span>
              <span>{t("capacityLabel", { capacity: z.capacity ?? t("noCapacityLimit") })}</span>
              <span>{t("seatsLeftLabel", { seats: z.seatsLeft ?? t("noCapacityLimit") })}</span>
              {!z.isActive && <Badge tone="danger">{td("inactive")}</Badge>}
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, show, fullness }} />
    </section>
  );
}
