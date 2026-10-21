import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { getZone } from "@/server/services/zones";
import { hotelOptions } from "@/server/services/hotels";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import { addGateAction, bulkAssignZoneAction, removeGateAction, setZoneActiveAction, updateZoneAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Badge, DetailList, PageHeader, Section } from "@/components/ui/Layout";
import { BackLink } from "@/components/ui/BackLink";
import { ZoneFields } from "@/components/zones/ZoneFields";

export default async function ZoneDetailPage({ params }: PageProps<"/[locale]/zones/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const zone = await orNotFound(getZone(user, id));
  const canManage = can(user, "zone.manageGates");
  const canAssign = can(user, "zone.manageAssignments");
  const [t, tc, format, hotels] = await Promise.all([
    getTranslations("zones"),
    getTranslations("common"),
    getFormatter(),
    canAssign ? hotelOptions(user) : Promise.resolve([]),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/zones" label={t("title")} />
      <PageHeader title={zone.name} />
      {!zone.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}

      <Section title={t("details")}>
        <DetailList
          items={[
            [t("capacity"), zone.capacity ?? "—"],
            [t("attendeeCount"), zone.attendeeCount],
            [tc("updated"), format.dateTime(zone.updatedAt, { dateStyle: "medium", timeStyle: "short" })],
          ]}
        />
        {zone.notes && <p className="text-muted">{zone.notes}</p>}
      </Section>

      <Section title={t("gates")}>
        {zone.gates.length === 0 ? (
          <p>{t("noGates")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {zone.gates.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <span className="text-lg font-semibold">{g.name}</span>
                {g.notes && <span className="text-muted">{g.notes}</span>}
                {canManage && <ActionForm action={removeGateAction} hidden={{ id: g.id }} submitLabel={t("remove")} tone="danger" inline />}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <ActionForm action={addGateAction} hidden={{ zoneId: zone.id }} submitLabel={t("addGate")} inline resetOnSuccess>
            <TextField name="name" label={t("gateName")} required maxLength={120} />
          </ActionForm>
        )}
      </Section>

      {canAssign && (
        <Section title={t("bulkAssign")}>
          <p className="text-muted">{t("bulkAssignHint")}</p>
          <ActionForm action={bulkAssignZoneAction} hidden={{ zoneId: zone.id }} submitLabel={t("assign")} inline resetOnSuccess>
            <SelectField
              name="hotelId"
              label={t("chooseHotel")}
              emptyLabel={t("unassignedAttendees")}
              options={hotels.map((h) => ({ value: h.id, label: h.name }))}
            />
          </ActionForm>
        </Section>
      )}

      {can(user, "zone.update") && (
        <Section title={t("edit")}>
          <ActionForm action={updateZoneAction} hidden={{ id: zone.id }} submitLabel={tc("save")}>
            <ZoneFields zone={zone} />
          </ActionForm>
        </Section>
      )}

      {can(user, "zone.deactivate") && (
        <Section title={tc("status")}>
          <ActionForm
            action={setZoneActiveAction}
            hidden={{ id: zone.id, active: String(!zone.isActive) }}
            submitLabel={zone.isActive ? t("deactivate") : t("activate")}
            confirmMessage={zone.isActive ? t("confirmDeactivate") : undefined}
            tone={zone.isActive ? "danger" : "secondary"}
          />
        </Section>
      )}
    </section>
  );
}
