import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import type { SessionUser } from "@/lib/auth/session";
import { assignableRoles, can, canEditPerson, canResetPin, canSetAttendeeHotel } from "@/server/policies";
import { getPerson } from "@/server/services/people";
import { getCluster } from "@/server/services/clusters";
import { hotelOptions } from "@/server/services/hotels";
import { zoneOptions } from "@/server/services/zones";
import { listRooms } from "@/server/services/rooms";
import { getAttendanceTrail } from "@/server/services/attendance";
import { changeRoleAction, recordCheckInOutAction, resetPinAction, setPersonHotelAction, setPersonRoomAction, setPersonStatusAction, setPersonZoneAction, updateMedicalNeedsAction, updatePersonAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Badge, DetailList, PageHeader, Section } from "@/components/ui/Layout";

type Person = Awaited<ReturnType<typeof getPerson>>;

/** Detail + management page for one person; used by /people/[id] and /coordinators/[id]. */
export async function PersonDetail({ user, person, backHref }: { user: SessionUser; person: Person; backHref: string }) {
  const editable = can(user, "person.update") && canEditPerson(user, person);
  const isSelf = user.id === person.id;
  const canHotel = person.role === "CUSTOMER" && canSetAttendeeHotel(user, person.hotelId);
  const canZone = person.role === "CUSTOMER" && can(user, "zone.manageAssignments");
  const canRoom = person.role === "CUSTOMER" && Boolean(person.hotelId) && can(user, "room.manageAssignments");
  const canRole = !isSelf && can(user, "person.changeRole") && canEditPerson(user, person);
  const canStatus = !isSelf && can(user, "person.deactivate") && canEditPerson(user, person);
  const canPin = canResetPin(user, person);
  const canCheckInOut = person.role === "CUSTOMER" && can(user, "attendance.checkInOut");
  // An Admin selecting a cluster coordinator sees the hotels (and their own
  // coordinators) under that cluster — same data the Clusters section already
  // shows, reused rather than re-queried from scratch.
  const canSeeClusterReports = person.role === "CLUSTER_COORDINATOR" && Boolean(person.cluster) && can(user, "dashboard.viewAll");
  const [t, tc, tr, ts, tz, th, ta, format, hotels, zones, roomList, trail, cluster] = await Promise.all([
    getTranslations("people"),
    getTranslations("common"),
    getTranslations("roles"),
    getTranslations("busStatus"),
    getTranslations("zones"),
    getTranslations("hotels"),
    getTranslations("attendance"),
    getFormatter(),
    canHotel ? hotelOptions(user) : Promise.resolve([]),
    canZone ? zoneOptions(user) : Promise.resolve([]),
    canRoom ? listRooms(user, person.hotelId!) : Promise.resolve([]),
    person.role === "CUSTOMER" ? getAttendanceTrail(user, person.id) : Promise.resolve(null),
    canSeeClusterReports ? getCluster(user, person.cluster!.id) : Promise.resolve(null),
  ]);
  const hotelSelect = hotels.map((h) => ({ value: h.id, label: h.name }));
  const zoneSelect = zones.map((z) => ({ value: z.id, label: z.name }));
  const availableRooms = roomList.filter((r) => r.isActive && (r.id === person.roomId || r.occupied < r.capacity));

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
              ? ([
                  [t("hotel"), person.hotel ? <Link key="h" href={`/hotels/${person.hotel.id}`} className="text-brand font-semibold underline">{person.hotel.name}</Link> : <Badge key="h" tone="warn">⚠ {t("noHotel")}</Badge>],
                  [tz("title"), person.zone ? <Link key="z" href={`/zones/${person.zone.id}`} className="text-brand font-semibold underline">{person.zone.name}</Link> : "—"],
                  ...(person.zone
                    ? ([
                        [
                          tz("gates"),
                          person.zone.gates.length ? person.zone.gates.map((g) => g.name).join(", ") : tz("noGates"),
                        ],
                      ] as [string, React.ReactNode][])
                    : []),
                  [t("gender"), person.gender || "—"],
                  ...(person.address !== undefined ? ([[t("address"), person.address ?? "—"]] as [string, React.ReactNode][]) : []),
                  ...(person.medicalNeeds !== undefined
                    ? ([
                        [
                          t("medicalNeeds"),
                          person.medicalNeeds ? (
                            <span key="mn" className="whitespace-pre-wrap">
                              {person.medicalNeeds}
                            </span>
                          ) : (
                            t("medicalNeedsNone")
                          ),
                        ],
                      ] as [string, React.ReactNode][])
                    : []),
                ] as [string, React.ReactNode][])
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

      {cluster && (
        <Section title={t("clusterReports")}>
          {cluster.hotels.length === 0 ? (
            <p>{t("noClusterHotels")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {cluster.hotels.map((h) => (
                <li key={h.id} className="rounded-lg border border-line p-3 flex flex-col gap-1">
                  <Link href={`/hotels/${h.id}`} className="text-lg font-semibold text-brand underline">
                    🏨 {h.name}
                  </Link>
                  {h.coordinators.length === 0 ? (
                    <span className="text-muted">{t("noCoordinator")}</span>
                  ) : (
                    <span className="flex flex-wrap gap-x-3">
                      {h.coordinators.map((c) => (
                        <Link key={c.id} href={`/coordinators/${c.id}`} className="text-brand font-semibold underline">
                          {c.name}
                        </Link>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {editable && (
        <Section title={t("edit")}>
          <ActionForm action={updatePersonAction} hidden={{ id: person.id }} submitLabel={tc("save")}>
            <TextField name="name" label={t("name")} defaultValue={person.name} required maxLength={120} />
            <TextField name="phone" label={t("phone")} defaultValue={person.phone} type="tel" inputMode="tel" required hint={t("phoneChangeHint")} />
            {person.role === "CUSTOMER" && <TextField name="address" label={t("address")} defaultValue={person.address ?? ""} multiline />}
            {person.role === "CUSTOMER" && <TextField name="gender" label={t("gender")} defaultValue={person.gender ?? ""} maxLength={40} />}
          </ActionForm>
        </Section>
      )}

      {person.role === "CUSTOMER" && person.canEditMedicalNeeds && (
        <Section title={t("medicalNeeds")}>
          <ActionForm action={updateMedicalNeedsAction} hidden={{ id: person.id }} submitLabel={t("saveMedicalNeeds")}>
            <TextField name="medicalNeeds" label={t("medicalNeeds")} hint={t("medicalNeedsHint")} defaultValue={person.medicalNeeds ?? ""} multiline />
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

      {canZone && (
        <Section title={tz("title")}>
          <ActionForm action={setPersonZoneAction} hidden={{ id: person.id }} submitLabel={tc("save")} inline>
            <SelectField name="zoneId" label={tz("title")} defaultValue={person.zoneId ?? ""} emptyLabel={tz("unassignedAttendees")} options={zoneSelect} />
          </ActionForm>
        </Section>
      )}

      {canRoom && (
        <Section title={th("rooms")}>
          {person.room && (
            <p className="font-semibold">
              {th("roomLabel")}: {person.room.label}
            </p>
          )}
          {availableRooms.length === 0 ? (
            <p>{th("noRooms")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {availableRooms.map((r) => {
                const selected = r.id === person.roomId;
                return (
                  <li key={r.id}>
                    <ActionForm
                      action={setPersonRoomAction}
                      hidden={{ id: person.id, roomId: selected ? "" : r.id }}
                      submitLabel={`${r.label} · ${th("occupancy", { occupied: r.occupied, capacity: r.capacity })}`}
                      tone={selected ? "primary" : "secondary"}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {trail && (
        <Section title={ta("title")}>
          <p>
            {trail.status.checkedIn
              ? ta("statusCheckedIn", { time: format.dateTime(trail.status.checkedInAt!, { timeStyle: "short" }) })
              : ta("statusNotCheckedIn")}
          </p>
          {canCheckInOut && (
            <div className="flex flex-wrap gap-3">
              <ActionForm action={recordCheckInOutAction} hidden={{ userId: person.id, type: "CHECK_IN" }} submitLabel={ta("checkIn")} inline />
              <ActionForm action={recordCheckInOutAction} hidden={{ userId: person.id, type: "CHECK_OUT" }} submitLabel={ta("checkOut")} tone="secondary" inline />
            </div>
          )}
          {trail.events.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold text-brand">{ta("history", { count: trail.events.length })}</summary>
              <ul className="mt-2 flex flex-col gap-1 text-base">
                {trail.events.map((e) => (
                  <li key={e.id}>
                    {ta(`type.${e.type}`)}
                    {e.gate && ` · ${e.gate.name}`}
                    {e.bus && ` · ${e.bus.label}`}
                    {" · "}
                    {format.dateTime(e.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    {e.recordedBy && ` · ${ta("by", { name: e.recordedBy.name })}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
