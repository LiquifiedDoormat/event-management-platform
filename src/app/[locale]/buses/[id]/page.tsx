import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { can } from "@/server/policies";
import { getBus } from "@/server/services/buses";
import { hotelOptions } from "@/server/services/hotels";
import { coordinatorOptions } from "@/server/services/people";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import {
  addStopAction,
  assignBusCoordinatorAction,
  moveStopAction,
  reassignBusHotelAction,
  removeStopAction,
  setBusActiveAction,
  updateBusAction,
  updateStopAction,
} from "@/features/admin/actions";
import { correctStatusAction, endTripAction, startTripAction } from "@/features/trips/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField } from "@/components/ui/Fields";
import { Badge, DetailList, MapsLink, PageHeader, Section } from "@/components/ui/Layout";
import { BusFields, StopFields } from "@/components/buses/BusFields";

export default async function BusDetailPage({ params }: PageProps<"/[locale]/buses/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const bus = await orNotFound(getBus(user, id));
  const isOwner = can(user, "bus.reassignHotel");
  const canEditStops = can(user, "bus.editStops");
  const [t, tc, ts, ttrip, format, hotels, coordinators] = await Promise.all([
    getTranslations("buses"),
    getTranslations("common"),
    getTranslations("busStatus"),
    getTranslations("trip"),
    getFormatter(),
    isOwner ? hotelOptions(user) : Promise.resolve([]),
    isOwner ? coordinatorOptions(user) : Promise.resolve([]),
  ]);
  const trip = bus.trips[0];
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/buses" label={t("title")} />
      <PageHeader title={`🚌 ${bus.label}`} />
      <Link href={`/track/${bus.id}`} className="text-brand font-semibold underline">
        👁 {t("attendeeView")}
      </Link>
      {!bus.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}

      <Section title={t("details")}>
        <DetailList
          items={[
            [t("hotel"), <Link key="h" href={`/hotels/${bus.hotel.id}`} className="text-brand font-semibold underline">{bus.hotel.name}</Link>],
            [t("registration"), bus.registration || "—"],
            [
              t("coordinator"),
              bus.coordinator ? (
                <span key="c">
                  <Link href={`/coordinators/${bus.coordinator.id}`} className="text-brand font-semibold underline">{bus.coordinator.name}</Link>{" "}
                  · <a href={`tel:${bus.coordinator.phone}`} className="underline">📞 {bus.coordinator.phone}</a>
                </span>
              ) : (
                t("noCoordinator")
              ),
            ],
            [
              t("currentStatus"),
              trip ? (
                <span key="s">
                  <Badge tone="ok">{ts(trip.status)}</Badge> {t("since", { time: when(trip.statusChangedAt) })} · {trip.coordinator.name}
                </span>
              ) : (
                t("noTrip")
              ),
            ],
            [t("lastLocation"), bus.location ? when(bus.location.recordedAt) : t("noLocation")],
            [t("routeNotes"), bus.routeNotes || "—"],
          ]}
        />
      </Section>

      {can(user, "trip.manage") && bus.isActive && (
        <Section title={ttrip("staffTitle")}>
          {trip ? (
            <>
              <ActionForm action={correctStatusAction} hidden={{ tripId: trip.id, version: String(trip.statusVersion) }} submitLabel={ttrip("correctStatus")} inline>
                <SelectField
                  name="status"
                  label={ttrip("statusTitle")}
                  defaultValue={trip.status}
                  options={(["BOARDING", "TO_HOTEL", "AT_HOTEL", "TO_STOP", "AT_STOP"] as const).map((s) => ({ value: s, label: ts(s) }))}
                />
              </ActionForm>
              <ActionForm action={endTripAction} hidden={{ tripId: trip.id }} submitLabel={`⏹ ${ttrip("endTrip")}`} confirmMessage={ttrip("confirmEnd")} tone="danger" />
            </>
          ) : bus.coordinator ? (
            <ActionForm action={startTripAction} hidden={{ busId: bus.id }} submitLabel={`▶ ${ttrip("startTripFor", { name: bus.coordinator.name })}`} />
          ) : (
            <p>{ttrip("needsCoordinator")}</p>
          )}
        </Section>
      )}

      <Section title={t("stops")}>
        {bus.stops.length === 0 ? (
          <p>{t("noStops")}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {bus.stops.map((s, i) => (
              <li key={s.id} className="rounded-lg border border-line p-3 flex flex-col gap-2">
                <p className="text-lg font-semibold">
                  {s.sequence}. {s.name}
                </p>
                {s.timeNote && <p>🕒 {s.timeNote}</p>}
                {s.address && <p className="text-muted">{s.address}</p>}
                {s.latitude !== null && s.longitude !== null && <MapsLink lat={s.latitude} lng={s.longitude} label={t("openMap")} />}
                {canEditStops && (
                  <div className="flex flex-wrap gap-2">
                    {i > 0 && <ActionForm action={moveStopAction} hidden={{ id: s.id, direction: "up" }} submitLabel={`▲ ${t("moveUp")}`} tone="secondary" inline />}
                    {i < bus.stops.length - 1 && (
                      <ActionForm action={moveStopAction} hidden={{ id: s.id, direction: "down" }} submitLabel={`▼ ${t("moveDown")}`} tone="secondary" inline />
                    )}
                    <ActionForm action={removeStopAction} hidden={{ id: s.id }} submitLabel={`✕ ${t("removeStop")}`} confirmMessage={t("confirmRemoveStop", { name: s.name })} tone="danger" inline />
                  </div>
                )}
                {canEditStops && (
                  <details>
                    <summary className="min-h-11 cursor-pointer font-semibold text-brand">{t("editStop")}</summary>
                    <ActionForm action={updateStopAction} hidden={{ id: s.id }} submitLabel={tc("save")}>
                      <StopFields stop={s} />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
        {canEditStops && (
          <details>
            <summary className="min-h-11 cursor-pointer text-lg font-semibold text-brand">＋ {t("addStop")}</summary>
            <ActionForm action={addStopAction} hidden={{ busId: bus.id }} submitLabel={t("addStop")} resetOnSuccess>
              <StopFields />
            </ActionForm>
          </details>
        )}
      </Section>

      {can(user, "bus.update") && (
        <Section title={t("edit")}>
          <ActionForm action={updateBusAction} hidden={{ id: bus.id }} submitLabel={tc("save")}>
            <BusFields bus={bus} />
          </ActionForm>
        </Section>
      )}

      {isOwner && (
        <Section title={t("assignments")}>
          <ActionForm action={reassignBusHotelAction} hidden={{ id: bus.id }} submitLabel={t("moveToHotel")} inline>
            <SelectField name="hotelId" label={t("hotel")} defaultValue={bus.hotel.id} options={hotels.map((h) => ({ value: h.id, label: h.name }))} />
          </ActionForm>
          <ActionForm action={assignBusCoordinatorAction} hidden={{ id: bus.id }} submitLabel={t("assignCoordinator")} inline>
            <SelectField
              name="coordinatorId"
              label={t("coordinator")}
              defaultValue={bus.coordinator?.id}
              emptyLabel={t("none")}
              options={coordinators.map((c) => ({ value: c.id, label: c.coordinatedHotel ? `${c.name} (${c.coordinatedHotel.name})` : c.name }))}
            />
          </ActionForm>
        </Section>
      )}

      {can(user, "bus.deactivate") && (
        <Section title={tc("status")}>
          <ActionForm
            action={setBusActiveAction}
            hidden={{ id: bus.id, active: String(!bus.isActive) }}
            submitLabel={bus.isActive ? t("deactivate") : t("activate")}
            confirmMessage={bus.isActive ? t("confirmDeactivate") : undefined}
            tone={bus.isActive ? "danger" : "secondary"}
          />
        </Section>
      )}
    </section>
  );
}
