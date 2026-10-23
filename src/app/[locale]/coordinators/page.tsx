import { getTranslations, setRequestLocale } from "next-intl/server";
import { assignableRoles } from "@/server/policies";
import { listPeople } from "@/server/services/people";
import { param, requireStaff } from "@/lib/utils/page";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";

// Covers both hotel coordinators and cluster coordinators in one list, each
// clearly labelled by role — there is no separate "cluster coordinators" page.
const ROLES = ["COORDINATOR", "CLUSTER_COORDINATOR"] as const;

export default async function CoordinatorsPage({ params, searchParams }: PageProps<"/[locale]/coordinators">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const roleFilter = param(sp.role);
  const role = roleFilter === "COORDINATOR" || roleFilter === "CLUSTER_COORDINATOR" ? roleFilter : [...ROLES];
  const [t, td, tc, tr, page] = await Promise.all([
    getTranslations("coordinators"),
    getTranslations("directory"),
    getTranslations("common"),
    getTranslations("roles"),
    listPeople(user, { q, cursor, role }),
  ]);
  const canAdd = assignableRoles(user).includes("COORDINATOR") || assignableRoles(user).includes("CLUSTER_COORDINATOR");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={canAdd ? { href: "/people/new?role=COORDINATOR", label: t("add") } : undefined} />
      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={roleFilter ? 1 : 0}>
        <FilterSelect
          name="role"
          label={t("title")}
          value={roleFilter}
          allLabel={td("all")}
          options={ROLES.map((r) => ({ value: r, label: tr(r) }))}
        />
      </SearchForm>
      {page.items.length === 0 ? (
        <EmptyState>{td("noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((c) => (
            <ListCard key={c.id} href={`/coordinators/${c.id}`} title={c.name}>
              <span>📞 {c.phone}</span>
              <Badge tone={c.role === "CLUSTER_COORDINATOR" ? "info" : undefined}>{tr(c.role)}</Badge>
              {c.role === "CLUSTER_COORDINATOR" ? (
                c.cluster ? <span>🗺️ {c.cluster.name}</span> : <Badge tone="warn">⚠ {t("noCluster")}</Badge>
              ) : c.hotel ? (
                <span>🏨 {c.hotel.name}</span>
              ) : (
                <Badge tone="warn">⚠ {t("noHotel")}</Badge>
              )}
              {c.designatedBuses.length > 0 && <span>🚌 {c.designatedBuses.map((b) => b.label).join(", ")}</span>}
              {c.status === "INACTIVE" && <Badge tone="danger">{tc("inactive")}</Badge>}
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, role: roleFilter }} />
    </section>
  );
}
