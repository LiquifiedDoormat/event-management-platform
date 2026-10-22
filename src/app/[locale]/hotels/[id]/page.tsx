import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { can } from "@/server/policies";
import { getHotel } from "@/server/services/hotels";
import { coordinatorOptions } from "@/server/services/people";
import { listRooms } from "@/server/services/rooms";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import {
  addHotelCoordinatorAction,
  createRoomAction,
  removeHotelCoordinatorAction,
  setHotelActiveAction,
  setRoomActiveAction,
  updateHotelAction,
} from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Badge, DetailList, MapsLink, PageHeader, Section } from "@/components/ui/Layout";
import { HotelFields } from "@/components/hotels/HotelFields";

export default async function HotelDetailPage({ params }: PageProps<"/[locale]/hotels/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const hotel = await orNotFound(getHotel(user, id));
  const canAssign = can(user, "hotel.manageCoordinators");
  const canManageRooms = can(user, "room.manage");
  const [t, tc, format, coordinators, rooms] = await Promise.all([
    getTranslations("hotels"),
    getTranslations("common"),
    getFormatter(),
    canAssign ? coordinatorOptions(user) : Promise.resolve([]),
    listRooms(user, hotel.id),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/hotels" label={t("title")} />
      <PageHeader title={hotel.name} />
      {!hotel.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}

      <Section title={t("details")}>
        <DetailList
          items={[
            [t("address"), hotel.address],
            [
              t("location"),
              hotel.latitude !== null && hotel.longitude !== null ? (
                <MapsLink lat={hotel.latitude} lng={hotel.longitude} label={t("openMap")} />
              ) : (
                t("noLocation")
              ),
            ],
            [t("attendees"), <Link key="a" href={`/people?role=CUSTOMER&hotelId=${hotel.id}`} className="text-brand font-semibold underline">{hotel._count.members}</Link>],
            [t("notes"), hotel.notes || "—"],
            [tc("updated"), format.dateTime(hotel.updatedAt, { dateStyle: "medium", timeStyle: "short" })],
          ]}
        />
      </Section>

      <Section title={t("coordinators")}>
        {hotel.coordinators.length === 0 ? (
          <Badge tone="warn">⚠ {t("noCoordinator")}</Badge>
        ) : (
          <ul className="flex flex-col gap-2">
            {hotel.coordinators.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/coordinators/${c.id}`} className="text-lg text-brand font-semibold underline">
                  {c.name}
                </Link>
                <a href={`tel:${c.phone}`} className="underline">📞 {c.phone}</a>
                {canAssign && (
                  <ActionForm
                    action={removeHotelCoordinatorAction}
                    hidden={{ id: hotel.id, coordinatorId: c.id }}
                    submitLabel={t("remove")}
                    tone="danger"
                    inline
                    confirmMessage={t("confirmRemoveCoordinator", { name: c.name })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canAssign && (
          <ActionForm action={addHotelCoordinatorAction} hidden={{ id: hotel.id }} submitLabel={t("assign")} inline resetOnSuccess>
            <SelectField
              name="coordinatorId"
              label={t("chooseCoordinator")}
              emptyLabel={t("choose")}
              hint={t("moveHint")}
              options={coordinators.map((c) => ({
                value: c.id,
                label: c.coordinatedHotel ? `${c.name} (${c.coordinatedHotel.name})` : c.name,
              }))}
            />
          </ActionForm>
        )}
      </Section>

      <Section title={t("buses")}>
        {hotel.buses.length === 0 ? (
          <p>{t("noBuses")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {hotel.buses.map((b) => (
              <li key={b.id}>
                <Link href={`/buses/${b.id}`} className="text-lg text-brand font-semibold underline">
                  🚌 {b.label}
                </Link>{" "}
                {b.registration && <span className="text-muted">{b.registration}</span>}{" "}
                {!b.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}
              </li>
            ))}
          </ul>
        )}
        {can(user, "bus.create") && hotel.isActive && (
          <Link href={`/buses/new?hotelId=${hotel.id}`} className="text-brand font-semibold underline">
            ＋ {t("addBus")}
          </Link>
        )}
      </Section>

      <Section title={t("rooms")}>
        <p className="text-muted">{t("roomsHint")}</p>
        {rooms.length === 0 ? (
          <p>{t("noRooms")}</p>
        ) : (
          // Grid of room "cards" — a simple, original stand-in for a booking-site
          // seat/room picker (no proprietary layout copied): each card shows the
          // room and how full it is at a glance, colour-coded the same way the
          // rest of the app marks full/available/inactive.
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rooms.map((r) => {
              const full = r.occupied >= r.capacity;
              return (
                <li
                  key={r.id}
                  className={`flex flex-col gap-1 rounded-lg border-2 p-3 ${
                    !r.isActive ? "border-line bg-gray-50 opacity-60" : full ? "border-danger bg-red-50" : "border-ok bg-green-50"
                  }`}
                >
                  <span className="text-lg font-bold">{r.label}</span>
                  <span className="font-semibold">{t("occupancy", { occupied: r.occupied, capacity: r.capacity })}</span>
                  {!r.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}
                  {canManageRooms && (
                    <ActionForm
                      action={setRoomActiveAction}
                      hidden={{ id: r.id, active: String(!r.isActive) }}
                      submitLabel={r.isActive ? t("deactivateRoom") : t("activateRoom")}
                      confirmMessage={r.isActive ? t("confirmDeactivateRoom") : undefined}
                      tone="secondary"
                      inline
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canManageRooms && (
          <ActionForm action={createRoomAction} hidden={{ hotelId: hotel.id }} submitLabel={t("addRoom")} inline resetOnSuccess>
            <TextField name="label" label={t("roomLabel")} required maxLength={40} />
            <TextField name="capacity" type="number" min={1} label={t("roomCapacity")} required />
          </ActionForm>
        )}
      </Section>

      {can(user, "hotel.update") && (
        <Section title={t("edit")}>
          <ActionForm action={updateHotelAction} hidden={{ id: hotel.id }} submitLabel={tc("save")}>
            <HotelFields hotel={hotel} />
          </ActionForm>
        </Section>
      )}

      {can(user, "hotel.deactivate") && (
        <Section title={tc("status")}>
          <ActionForm
            action={setHotelActiveAction}
            hidden={{ id: hotel.id, active: String(!hotel.isActive) }}
            submitLabel={hotel.isActive ? t("deactivate") : t("activate")}
            confirmMessage={hotel.isActive ? t("confirmDeactivate") : undefined}
            tone={hotel.isActive ? "danger" : "secondary"}
          />
        </Section>
      )}
    </section>
  );
}
