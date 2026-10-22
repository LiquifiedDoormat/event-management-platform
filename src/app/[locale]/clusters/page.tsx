import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { listClusters } from "@/server/services/clusters";
import { param, requireStaff } from "@/lib/utils/page";
import { EmptyState, ListCard, PageHeader } from "@/components/ui/Layout";
import { Pagination, SearchForm } from "@/components/ui/Directory";

export default async function ClustersPage({ params, searchParams }: PageProps<"/[locale]/clusters">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const q = param(sp.q);
  const cursor = param(sp.cursor);
  const [t, td, page] = await Promise.all([
    getTranslations("clusters"),
    getTranslations("directory"),
    listClusters(user, { q, cursor }),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} action={can(user, "cluster.create") ? { href: "/clusters/new", label: t("add") } : undefined} />
      <p className="text-muted">{t("intro")}</p>
      <SearchForm q={q} placeholder={t("searchPlaceholder")} />
      {page.items.length === 0 ? (
        <EmptyState>{q ? td("noResults") : t("none")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((c) => (
            <ListCard key={c.id} href={`/clusters/${c.id}`} title={c.name}>
              <span>{t("counts", { hotels: c.hotelCount, coordinators: c.coordinatorCount })}</span>
            </ListCard>
          ))}
        </ul>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ q, cursor }} />
    </section>
  );
}
