import { getTranslations, setRequestLocale } from "next-intl/server";
import { assignableRoles } from "@/server/policies";
import { listPeople } from "@/server/services/people";
import { param, requireStaff } from "@/lib/utils/page";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { Pagination, SearchForm } from "@/components/ui/Directory";

export default async function CoordinatorsPage({ params, searchParams }: PageProps<"/[locale]/coordinators">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const [t, td, tc, page] = await Promise.all([
    getTranslations("coordinators"),
    getTranslations("directory"),
    getTranslations("common"),
    listPeople(user, { q, cursor, role: "COORDINATOR" }),
  ]);
  const canAdd = assignableRoles(user).includes("COORDINATOR");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={canAdd ? { href: "/people/new?role=COORDINATOR", label: t("add") } : undefined} />
      <SearchForm q={q} placeholder={t("searchPlaceholder")} />
      {page.items.length === 0 ? (
        <EmptyState>{td("noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((c) => (
            <ListCard key={c.id} href={`/coordinators/${c.id}`} title={c.name}>
              <span>📞 {c.phone}</span>
              <span>{c.hotel ? `🏨 ${c.hotel.name}` : <Badge tone="warn">⚠ {t("noHotel")}</Badge>}</span>
              {c.designatedBuses.length > 0 && <span>🚌 {c.designatedBuses.map((b) => b.label).join(", ")}</span>}
              {c.status === "INACTIVE" && <Badge tone="danger">{tc("inactive")}</Badge>}
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor }} />
    </section>
  );
}
