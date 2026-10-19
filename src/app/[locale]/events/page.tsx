import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { listEvents } from "@/server/services/events";
import { requireStaff } from "@/lib/utils/page";
import { createEventAction } from "@/features/events/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge, ListCard, PageHeader, Section } from "@/components/ui/Layout";
import { EventFields } from "@/components/events/EventFields";

export default async function EventsPage({ params }: PageProps<"/[locale]/events">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale, { needsEvent: false });
  if (!can(user, "event.update")) notFound();
  const [t, tc, format, events] = await Promise.all([getTranslations("events"), getTranslations("common"), getFormatter(), listEvents(user)]);
  const dates = (a: Date | null, b: Date | null) =>
    [a, b].filter(Boolean).map((d) => format.dateTime(d!, { dateStyle: "medium", timeZone: "UTC" })).join(" – ");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("title")} />
      <ul className="flex flex-col gap-3">
        {events.map((e) => (
          <ListCard key={e.id} href={`/events/${e.id}`} title={e.name}>
            {(e.startsOn || e.endsOn) && <span>📅 {dates(e.startsOn, e.endsOn)}</span>}
            <span>{t("counts", { hotels: e._count.hotels, members: e._count.members })}</span>
            <span className="flex flex-wrap gap-2">
              {e.id === user.eventId && <Badge tone="ok">{t("current")}</Badge>}
              {!e.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}
            </span>
          </ListCard>
        ))}
      </ul>
      {can(user, "event.create") && (
        <Section title={t("add")}>
          <ActionForm action={createEventAction} submitLabel={t("create")}>
            <EventFields />
          </ActionForm>
        </Section>
      )}
    </section>
  );
}
