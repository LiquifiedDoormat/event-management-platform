import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { getEvent } from "@/server/services/events";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import { setEventActiveAction, updateEventAction } from "@/features/events/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { BackLink } from "@/components/ui/BackLink";
import { Badge, PageHeader, Section } from "@/components/ui/Layout";
import { EventFields } from "@/components/events/EventFields";

export default async function EventPage({ params }: PageProps<"/[locale]/events/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale, { needsEvent: false });
  const event = await orNotFound(getEvent(user, id));
  const [t, tc] = await Promise.all([getTranslations("events"), getTranslations("common")]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/events" label={t("title")} />
      <PageHeader title={event.name} />
      {!event.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}
      <Section title={t("edit")}>
        <ActionForm action={updateEventAction} hidden={{ id: event.id }} submitLabel={tc("save")}>
          <EventFields event={event} />
        </ActionForm>
      </Section>
      {can(user, "event.deactivate") && (
        <Section title={tc("status")}>
          <p>{t("deactivateHelp")}</p>
          <ActionForm
            action={setEventActiveAction}
            hidden={{ id: event.id, active: String(!event.isActive) }}
            submitLabel={event.isActive ? t("deactivate") : t("activate")}
            confirmMessage={event.isActive ? t("confirmDeactivate") : undefined}
            tone={event.isActive ? "danger" : "secondary"}
          />
        </Section>
      )}
    </section>
  );
}
