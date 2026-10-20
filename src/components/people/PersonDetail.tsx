import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import type { SessionUser } from "@/lib/auth/session";
import { assignableRoles, can, canEditPerson, canResetPin, canSetAttendeeHotel } from "@/server/policies";
import { getPerson } from "@/server/services/people";
import { hotelOptions } from "@/server/services/hotels";
import { changeRoleAction, resetPinAction, setPersonHotelAction, setPersonStatusAction, updatePersonAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Badge, DetailList, PageHeader, Section } from "@/components/ui/Layout";

type Person = Awaited<ReturnType<typeof getPerson>>;

/** Detail + management page for one person; used by /people/[id] and /coordinators/[id]. */
export async function PersonDetail({ user, person, backHref }: { user: SessionUser; person: Person; backHref: string }) {
  const editable = can(user, "person.update") && canEditPerson(user, person);
  const isSelf = user.id === person.id;
  const canHotel = person.role === "CUSTOMER" && canSetAttendeeHotel(user, person.hotelId);
  const canRole = !isSelf && can(user, "person.changeRole") && canEditPerson(user, person);
  const canStatus = !isSelf && can(user, "person.deactivate") && canEditPerson(user, person);
  const canPin = canResetPin(user, person);
  const [t, tc, tr, ts, format, hotels] = await Promise.all([
    getTranslations("people"),
    getTranslations("common"),
    getTranslations("roles"),
    getTranslations("busStatus"),
    getFormatter(),
    canHotel ? hotelOptions(user) : Promise.resolve([]),
  ]);
  const hotelSelect = hotels.map((h) => ({ value: h.id, label: h.name }));

  return (
    <section className="flex flex-col gap-5">
      <BackLink href={backHref} label={t("back")} />
      <PageHeader title={person.name} />
      <div className="flex flex-wrap gap-2">
        <Badge>{tr(person.role)}</Badge>
        {person.status === "INACTIVE" ? <Badge tone="danger">{tc("inactive")}</Badge> : <Badge tone="ok">{tc("active")}</Badge>}
      </div>

      <Section title={t("details")}>
        <DetailList
          items={[
            [t("phone"), <a key="p" href={`tel:${person.phone}`} className="underline">📞 {person.phone}</a>],
            ...(person.role === "CUSTOMER"
              ? ([[t("hotel"), person.hotel ? <Link key="h" href={`/hotels/${person.hotel.id}`} className="text-brand font-semibold underline">{person.hotel.name}</Link> : <Badge key="h" tone="warn">⚠ {t("noHotel")}</Badge>]] as [string, React.ReactNode][])
              : []),
            ...(person.role === "CLUSTER_COORDINATOR"
              ? ([[t("designatedCluster"), person.cluster ? person.cluster.name : "—"]] as [string, React.ReactNode][])
              : []),
            ...(person.role === "COORDINATOR"
              ? ([
                  [t("designatedHotel"), person.hotel ? <Link key="ch" href={`/hotels/${person.hotel.id}`} className="text-brand font-semibold underline">{person.hotel.name}</Link> : "—"],
                  [
                    t("designatedBuses"),
                    person.designatedBuses.length ? (
                      <span key="b" className="flex flex-wrap gap-x-3">
                        {person.designatedBuses.map((b) => (
                          <Link key={b.id} href={`/buses/${b.id}`} className="text-brand font-semibold underline">🚌 {b.label}</Link>
                        ))}
                      </span>
                    ) : "—",
                  ],
                  [
                    t("currentTrip"),
                    person.trips.length ? (
                      <span key="tr">
                        {person.trips.map((tr) => (
                          <span key={tr.id}>🚌 {tr.bus.label} · <Badge tone="ok">{ts(tr.status)}</Badge></span>
                        ))}
                      </span>
                    ) : t("noTrip"),
                  ],
                ] as [string, React.ReactNode][])
              : []),
            [t("id"), <code key="id" className="text-base">{person.id}</code>],
            [tc("created"), format.dateTime(person.createdAt, { dateStyle: "medium" })],
          ]}
        />
      </Section>

      {editable && (
        <Section title={t("edit")}>
          <ActionForm action={updatePersonAction} hidden={{ id: person.id }} submitLabel={tc("save")}>
            <TextField name="name" label={t("name")} defaultValue={person.name} required maxLength={120} />
            <TextField name="phone" label={t("phone")} defaultValue={person.phone} type="tel" inputMode="tel" required hint={t("phoneChangeHint")} />
          </ActionForm>
        </Section>
      )}

      {canHotel && (
        <Section title={t("hotelAllotment")}>
          <ActionForm action={setPersonHotelAction} hidden={{ id: person.id }} submitLabel={t("saveHotel")} inline>
            <SelectField name="hotelId" label={t("hotel")} defaultValue={person.hotelId ?? ""} emptyLabel={t("noHotel")} options={hotelSelect} />
          </ActionForm>
        </Section>
      )}

      {canRole && (
        <Section title={t("role")}>
          <ActionForm action={changeRoleAction} hidden={{ id: person.id }} submitLabel={t("changeRole")} confirmMessage={t("confirmRoleChange")} inline>
            <SelectField name="role" label={t("role")} defaultValue={person.role} hint={t("roleHint")} options={assignableRoles(user).map((r) => ({ value: r, label: tr(r) }))} />
          </ActionForm>
        </Section>
      )}

      {person.pin && (canPin || isSelf) && (
        <Section title={t("pinTitle")}>
          <p>
            {person.pin.lockedUntil
              ? t("pinLocked", { time: format.dateTime(person.pin.lockedUntil, { timeStyle: "short" }) })
              : person.pin.isSet
                ? t("pinIsSet")
                : t("pinNotSet")}
          </p>
          {canPin && (
            <ActionForm
              action={resetPinAction}
              hidden={{ id: person.id }}
              submitLabel={t("resetPin")}
              confirmMessage={t("confirmResetPin", { name: person.name })}
              tone="secondary"
            />
          )}
        </Section>
      )}

      {canStatus && (
        <Section title={tc("status")}>
          <ActionForm
            action={setPersonStatusAction}
            hidden={{ id: person.id, status: person.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}
            submitLabel={person.status === "ACTIVE" ? t("deactivate") : t("activate")}
            confirmMessage={person.status === "ACTIVE" ? t("confirmDeactivate", { name: person.name }) : undefined}
            tone={person.status === "ACTIVE" ? "danger" : "secondary"}
          />
        </Section>
      )}
    </section>
  );
}
