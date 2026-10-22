import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { param } from "@/lib/utils/page";
import { listMyAttendees } from "@/server/services/people";
import { BackLink } from "@/components/ui/BackLink";
import { Badge, EmptyState } from "@/components/ui/Layout";
import { FilterSelect, Pagination, SearchForm } from "@/components/ui/Directory";

// Coordinator's searchable list of attendees at their hotel(s) in the current event.
// Filtering and authorization happen on the server (listMyAttendees).
export default async function MyAttendeesPage({ params, searchParams }: PageProps<"/[locale]/coordinator/people">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["COORDINATOR"]);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const hasMedicalNeeds = param(sp.hasMedicalNeeds) === "1" ? (true as const) : undefined;
  const [t, td, tc, tp, page] = await Promise.all([
    getTranslations("myAttendees"),
    getTranslations("directory"),
    getTranslations("common"),
    getTranslations("people"),
    listMyAttendees(user, { q, cursor, hasMedicalNeeds }),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/coordinator" label={tc("home")} />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <SearchForm q={q} placeholder={t("searchPlaceholder")} activeFilters={hasMedicalNeeds ? 1 : 0}>
        <FilterSelect
          name="hasMedicalNeeds"
          label={tp("medicalNeeds")}
          value={hasMedicalNeeds ? "1" : undefined}
          allLabel={td("all")}
          options={[{ value: "1", label: tp("medicalNeedsOnly") }]}
        />
      </SearchForm>
      {page.items.length === 0 ? (
        <EmptyState>{q ? td("noResults") : t("none")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-lg border border-line p-4">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {p.name}
                {p.hasMedicalNeeds && <Badge tone="warn">⚕ {tp("medicalNeeds")}</Badge>}
              </p>
              {p.hotel && <p className="text-muted">🏨 {p.hotel.name}</p>}
              <a href={`tel:${p.phone}`} className="inline-flex min-h-11 items-center self-start font-semibold text-brand underline">
                📞 {p.phone}
              </a>
            </li>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor, hasMedicalNeeds: hasMedicalNeeds ? "1" : undefined }} />
    </section>
  );
}
