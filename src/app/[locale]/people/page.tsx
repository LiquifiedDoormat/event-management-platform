import { getTranslations, setRequestLocale } from "next-intl/server";
import { assignableRoles } from "@/server/policies";
import { listPeople } from "@/server/services/people";
import { hotelOptions } from "@/server/services/hotels";
import { peopleFilter } from "@/lib/validation/entities";
import { param, requireStaff } from "@/lib/utils/page";
import { Badge, EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";
import { ExportAttendeesLink } from "@/components/people/ExportAttendeesLink";

const ROLES = ["OWNER", "ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR", "CUSTOMER"] as const;

export default async function PeoplePage({ params, searchParams }: PageProps<"/[locale]/people">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const filter = peopleFilter.parse({
    role: param(sp.role),
    status: param(sp.status),
    hotelId: param(sp.hotelId),
    hasMedicalNeeds: param(sp.hasMedicalNeeds),
  });
  const [t, td, tr, tc, page, hotels] = await Promise.all([
    getTranslations("people"),
    getTranslations("directory"),
    getTranslations("roles"),
    getTranslations("common"),
    listPeople(user, { q, cursor, ...filter }),
    hotelOptions(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={assignableRoles(user).length ? { href: "/people/new", label: t("add") } : undefined} />
      <ExportAttendeesLink label={t("exportAttendees")} xlsxLabel={t("exportAttendeesXlsx")} />
      <SearchForm
        q={q}
        placeholder={t("searchPlaceholder")}
        activeFilters={[filter.role, filter.status, filter.hotelId, filter.hasMedicalNeeds].filter(Boolean).length}
      >
        <FilterSelect name="role" label={t("role")} value={filter.role} allLabel={td("all")} options={ROLES.map((r) => ({ value: r, label: tr(r) }))} />
        <FilterSelect name="hotelId" label={t("hotel")} value={filter.hotelId} allLabel={td("all")} options={hotels.map((h) => ({ value: h.id, label: h.name }))} />
        <FilterSelect
          name="status"
          label={tc("status")}
          value={filter.status}
          allLabel={td("all")}
          options={[
            { value: "ACTIVE", label: tc("active") },
            { value: "INACTIVE", label: tc("inactive") },
          ]}
        />
        <FilterSelect
          name="hasMedicalNeeds"
          label={t("medicalNeeds")}
          value={filter.hasMedicalNeeds ? "1" : undefined}
          allLabel={td("all")}
          options={[{ value: "1", label: t("medicalNeedsOnly") }]}
        />
      </SearchForm>
      {page.items.length === 0 ? (
        <EmptyState>{td("noResults")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((p) => (
            <ListCard key={p.id} href={`/people/${p.id}`} title={p.name}>
              <span>📞 {p.phone}</span>
              <span className="flex flex-wrap gap-2">
                <Badge>{tr(p.role)}</Badge>
                {p.status === "INACTIVE" && <Badge tone="danger">{tc("inactive")}</Badge>}
                {p.role === "CUSTOMER" && !p.hotel && <Badge tone="warn">⚠ {t("noHotel")}</Badge>}
                {p.role === "CUSTOMER" && p.hasMedicalNeeds && <Badge tone="warn">⚕ {t("medicalNeeds")}</Badge>}
              </span>
              {p.hotel && (
                <span>🏨 {p.role === "COORDINATOR" ? t("coordinatesHotel", { hotel: p.hotel.name }) : p.hotel.name}</span>
              )}
              {p.cluster && <span>🗺️ {t("coordinatesCluster", { cluster: p.cluster.name })}</span>}
              {p.zone && <span>🪑 {p.zone.name}</span>}
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, ...filter, hasMedicalNeeds: filter.hasMedicalNeeds ? "1" : undefined }} />
    </section>
  );
}
