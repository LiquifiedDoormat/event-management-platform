import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { param } from "@/lib/utils/page";
import { AUDIT_ENTITY_TYPES, listAuditLog } from "@/server/services/settings";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/Layout";
import { FilterSelect, Pagination } from "@/components/ui/Directory";

const ENTITY_HREF: Record<string, (id: string) => string> = {
  Hotel: (id) => `/hotels/${id}`,
  Bus: (id) => `/buses/${id}`,
  User: (id) => `/people/${id}`,
  EventConfig: () => "/owner/settings",
};

export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/owner/audit">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER"]);
  const sp = await searchParams;
  const cursor = param(sp.cursor);
  const requested = param(sp.entity);
  const entity = AUDIT_ENTITY_TYPES.find((e) => e === requested);
  const signins = param(sp.signins) === "1" ? "1" : undefined;
  const [t, tc, td, format, page] = await Promise.all([
    getTranslations("audit"),
    getTranslations("common"),
    getTranslations("directory"),
    getFormatter(),
    listAuditLog(user, { cursor, entityType: entity, includeSignIns: Boolean(signins) }),
  ]);
  const label = (action: string) => (t.has(`actions.${action}`) ? t(`actions.${action}`) : action);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/owner" label={tc("home")} />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
        <FilterSelect name="entity" label={t("entity")} value={entity} allLabel={td("all")} options={AUDIT_ENTITY_TYPES.map((e) => ({ value: e, label: t(`entities.${e}`) }))} />
        <label className="flex min-h-12 items-center gap-2 font-semibold">
          <input type="checkbox" name="signins" value="1" defaultChecked={Boolean(signins)} className="h-6 w-6" />
          {t("showSignIns")}
        </label>
        <button type="submit" className="min-h-12 px-5 rounded-lg bg-brand text-brand-ink text-lg font-semibold">
          {td("searchButton")}
        </button>
      </form>
      {page.items.length === 0 ? (
        <EmptyState>{td("noResults")}</EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {page.items.map((e) => {
            const href = e.entityId ? ENTITY_HREF[e.entityType]?.(e.entityId) : undefined;
            const details = e.metadata ? JSON.stringify(e.metadata) : "";
            return (
              <li key={e.id} className="rounded-lg border border-line p-3 flex flex-col gap-1">
                <p className="text-lg font-semibold">{label(e.action)}</p>
                <p className="text-muted">
                  <time dateTime={e.createdAt.toISOString()}>{format.dateTime(e.createdAt, { dateStyle: "medium", timeStyle: "short" })}</time>
                  {" · "}
                  {e.actor ? (
                    <Link href={`/people/${e.actor.id}`} className="underline">
                      {e.actor.name}
                    </Link>
                  ) : (
                    t("system")
                  )}
                </p>
                <p>
                  {t.has(`entities.${e.entityType}`) ? t(`entities.${e.entityType}`) : e.entityType}{" "}
                  {href ? (
                    <Link href={href} className="text-brand font-semibold underline">
                      {t("open")}
                    </Link>
                  ) : (
                    e.entityId && <code className="text-base">{e.entityId}</code>
                  )}
                </p>
                {details && details !== "{}" && (
                  <code className="block break-all rounded bg-gray-50 p-2 text-sm">{details.length > 300 ? `${details.slice(0, 300)}…` : details}</code>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Pagination nextCursor={page.nextCursor} params={{ cursor, entity, signins }} />
    </section>
  );
}
