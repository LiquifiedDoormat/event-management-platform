import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/ui/BackLink";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { listSessions } from "@/server/services/attendanceSessions";
import { canManageAttendanceSession } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { orNotFound } from "@/lib/utils/page";
import { createAttendanceSessionAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { TextField } from "@/components/ui/Fields";
import { EmptyState, PageHeader } from "@/components/ui/Layout";

/** Sessions for one bus. Staff/cluster coordinators can view; the bus's own
 * coordinator (or staff) can also create new sessions. */
export default async function AttendanceSessionsPage({ params }: PageProps<"/[locale]/coordinator/manifest/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER", "ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR"]);
  const { bus, sessions } = await orNotFound(listSessions(user, id));
  const scope = await loadScope(user);
  const canCreate = canManageAttendanceSession(user, scope, id);
  const t = await getTranslations("attendance");
  const format = await getFormatter();
  const today = new Date().toISOString().slice(0, 10);
  const backHref = user.role === "OWNER" || user.role === "ADMIN" ? `/buses/${id}` : user.role === "COORDINATOR" ? "/coordinator" : "/org";

  return (
    <section className="flex flex-col gap-5">
      <BackLink href={backHref} label={t("title")} />
      <PageHeader title={`${t("manifestTitle")} · ${bus.label}`} />

      {canCreate && (
        <ActionForm action={createAttendanceSessionAction} hidden={{ busId: id }} submitLabel={t("createSession")} resetOnSuccess>
          <TextField name="date" type="date" label={t("sessionDate")} defaultValue={today} required />
          <TextField name="label" label={t("sessionLabel")} hint={t("sessionLabelHint")} maxLength={80} />
        </ActionForm>
      )}

      {sessions.length === 0 ? (
        <EmptyState>{t("noSessions")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/coordinator/manifest/${id}/${s.id}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 hover:border-brand"
              >
                <span className="text-lg font-semibold">
                  {format.dateTime(s.date, { dateStyle: "medium" })}
                  {s.label && ` · ${s.label}`}
                </span>
                <span className="text-muted">{t("sessionSummary", { boarded: s.boarded, absent: s.absent, total: s.total })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
