import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/ui/BackLink";
import { requireUser } from "@/lib/auth/current-user";
import { getSession } from "@/server/services/attendanceSessions";
import { orNotFound } from "@/lib/utils/page";
import { recordAttendanceMarkAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { TextField } from "@/components/ui/Fields";
import { Badge, PageHeader } from "@/components/ui/Layout";

export default async function AttendanceSessionDetailPage({ params }: PageProps<"/[locale]/coordinator/manifest/[id]/[sessionId]">) {
  const { locale, id, sessionId } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER", "ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR"]);
  const session = await orNotFound(getSession(user, sessionId));
  const t = await getTranslations("attendance");
  const format = await getFormatter();

  return (
    <section className="flex flex-col gap-5">
      <BackLink href={`/coordinator/manifest/${id}`} label={t("backToSessions")} />
      <PageHeader
        title={`${format.dateTime(session.date, { dateStyle: "medium" })}${session.label ? ` · ${session.label}` : ""}`}
      />
      <p className="text-lg font-semibold">{t("sessionSummary", session.summary)}</p>
      {!session.canEdit && <p className="text-muted">{t("viewOnly")}</p>}

      <ul className="flex flex-col gap-2">
        {session.roster.map(({ user: guest, record }) => {
          const expectedVersion = String(record?.version ?? 0);
          return (
            <li key={guest.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-semibold">{guest.name}</span>
                <a href={`tel:${guest.phone}`} className="underline">
                  📞 {guest.phone}
                </a>
                {record?.mark === "BOARDED" && <Badge tone="ok">{t("boarded")}</Badge>}
                {record?.mark === "ABSENT" && <Badge tone="danger">{t("absentStatus")}</Badge>}
                {!record && <Badge>{t("notRecorded")}</Badge>}
              </div>
              {record?.mark === "ABSENT" && record.note && <p className="text-muted">{record.note}</p>}
              {session.canEdit && (
                <div className="flex flex-wrap items-end gap-3">
                  <ActionForm
                    action={recordAttendanceMarkAction}
                    hidden={{ sessionId, userId: guest.id, mark: "BOARDED", expectedVersion }}
                    submitLabel={t("board")}
                    ariaLabel={`${t("board")} ${guest.name}`}
                    inline
                  />
                  <ActionForm
                    action={recordAttendanceMarkAction}
                    hidden={{ sessionId, userId: guest.id, mark: "ABSENT", expectedVersion }}
                    submitLabel={t("absent")}
                    ariaLabel={`${t("absent")} ${guest.name}`}
                    tone="secondary"
                    inline
                  >
                    <TextField name="note" label={t("absenceNote")} maxLength={300} />
                  </ActionForm>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
