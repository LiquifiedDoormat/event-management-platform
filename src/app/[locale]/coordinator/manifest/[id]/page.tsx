import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/ui/BackLink";
import { requireUser } from "@/lib/auth/current-user";
import { getBusManifest } from "@/server/services/attendance";
import { orNotFound } from "@/lib/utils/page";
import { recordBoardingAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge, EmptyState, PageHeader } from "@/components/ui/Layout";

export default async function ManifestPage({ params }: PageProps<"/[locale]/coordinator/manifest/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["COORDINATOR"]);
  const manifest = await orNotFound(getBusManifest(user, id));
  const t = await getTranslations("attendance");

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/coordinator" label={t("manifestTitle")} />
      <PageHeader title={`${t("manifestTitle")} · ${manifest.bus.label}`} />
      {manifest.attendees.length === 0 ? (
        <EmptyState>{t("noAttendees")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {manifest.attendees.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
              <span className="text-lg font-semibold">{a.name}</span>
              <a href={`tel:${a.phone}`} className="underline">📞 {a.phone}</a>
              {a.boarded ? <Badge tone="ok">{t("boarded")}</Badge> : <Badge>{t("notBoarded")}</Badge>}
              <div className="ml-auto flex gap-2">
                <ActionForm
                  action={recordBoardingAction}
                  hidden={{ userId: a.id, busId: manifest.bus.id, type: "BOARD" }}
                  submitLabel={t("board")}
                  ariaLabel={`${t("board")} ${a.name}`}
                  inline
                />
                <ActionForm
                  action={recordBoardingAction}
                  hidden={{ userId: a.id, busId: manifest.bus.id, type: "DEPART" }}
                  submitLabel={t("depart")}
                  ariaLabel={`${t("depart")} ${a.name}`}
                  tone="secondary"
                  inline
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
