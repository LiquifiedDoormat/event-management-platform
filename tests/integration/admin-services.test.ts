import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createSession, validateSession } from "@/lib/auth/session";
import { busInput, hotelInput, personCreateInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import * as hotels from "@/server/services/hotels";
import * as buses from "@/server/services/buses";
import * as people from "@/server/services/people";
import { createEvent, createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function expectError(promise: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

const hotel = (name: string) => hotelInput.parse({ name, address: `${name} Road` });

describe.skipIf(!hasTestDb)("hotel service", () => {
  beforeEach(resetDb);

  it("lets admins create and edit hotels", async () => {
    const admin = await staff("ADMIN");
    const { id } = await hotels.createHotel(admin, hotel("Palm"));
    await hotels.updateHotel(admin, id, hotelInput.parse({ name: "Palm Court", address: "1 Palm Rd", latitude: "12.9", longitude: "77.6" }));
    const h = await hotels.getHotel(admin, id);
    expect(h).toMatchObject({ name: "Palm Court", latitude: 12.9, longitude: 77.6 });
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(2);
  });

  it("rejects half a coordinate pair", () => {
    expect(hotelInput.safeParse({ name: "X", address: "Y", latitude: "12" }).success).toBe(false);
  });

  it("keeps owner-only actions away from admins", async () => {
    const admin = await staff("ADMIN");
    const { hotelA } = await createTwoHotels();
    await expectError(hotels.setHotelActive(admin, hotelA.id, false), "forbidden");
  });

  it("lets admins manage a hotel's coordinator roster (not owner-only, unlike before)", async () => {
    const admin = await staff("ADMIN");
    const { hotelA, coordB } = await createTwoHotels();
    await hotels.addHotelCoordinator(admin, hotelA.id, coordB.id);
    const h = await hotels.getHotel(admin, hotelA.id);
    expect(h.coordinators.map((c) => c.id)).toContain(coordB.id);
  });

  it("denies customers and coordinators", async () => {
    const { guestA, coordA, hotelA } = await createTwoHotels();
    await expectError(hotels.listHotels(guestA, {}), "forbidden");
    await expectError(hotels.getHotel(coordA, hotelA.id), "forbidden");
    await expectError(hotels.createHotel(coordA, hotel("Z")), "forbidden");
  });

  it("moves a coordinator between hotels (still one hotel per coordinator, many coordinators per hotel)", async () => {
    const owner = await staff("OWNER");
    const { hotelA, hotelB, coordA, coordB } = await createTwoHotels();
    await hotels.addHotelCoordinator(owner, hotelB.id, coordA.id);
    const hB = await hotels.getHotel(owner, hotelB.id);
    const hA = await hotels.getHotel(owner, hotelA.id);
    // hotelB now has both its own coordinator and coordA (many coordinators per hotel)...
    expect(hB.coordinators.map((c) => c.id).sort()).toEqual([coordA.id, coordB.id].sort());
    // ...but coordA is gone from hotelA (one hotel per coordinator).
    expect(hA.coordinators.map((c) => c.id)).not.toContain(coordA.id);
  });

  it("only assigns active coordinators", async () => {
    const owner = await staff("OWNER");
    const { hotelA, guestA } = await createTwoHotels();
    await expectError(hotels.addHotelCoordinator(owner, hotelA.id, guestA.id), "invalid", "notActiveCoordinator");
  });

  it("won't deactivate a hotel that still has buses or attendees", async () => {
    const owner = await staff("OWNER");
    const { hotelA } = await createTwoHotels();
    await expectError(hotels.setHotelActive(owner, hotelA.id, false), "conflict", "hotelInUse");
    const empty = await hotels.createHotel(owner, hotel("Empty"));
    await hotels.setHotelActive(owner, empty.id, false);
    expect((await hotels.listHotels(owner, {})).items.map((h) => h.name)).not.toContain("Empty");
  });

  it("paginates and searches", async () => {
    const admin = await staff("ADMIN");
    for (let i = 0; i < 30; i++) await hotels.createHotel(admin, hotel(`Hotel ${String(i).padStart(2, "0")}`));
    const first = await hotels.listHotels(admin, {});
    expect(first.items).toHaveLength(25);
    const second = await hotels.listHotels(admin, { cursor: first.nextCursor! });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect((await hotels.listHotels(admin, { q: "hotel 07" })).items.map((h) => h.name)).toEqual(["Hotel 07"]);
  });
});

describe.skipIf(!hasTestDb)("bus service", () => {
  beforeEach(resetDb);

  it("creates buses, rejects duplicate registrations and inactive hotels", async () => {
    const admin = await staff("ADMIN");
    const { hotelA } = await createTwoHotels();
    const input = busInput.parse({ label: "Bus 9", registration: "ka 01 ab 1234" });
    const { id } = await buses.createBus(admin, { ...input, hotelId: hotelA.id });
    expect((await buses.getBus(admin, id)).registration).toBe("KA01AB1234");
    await expectError(buses.createBus(admin, { ...input, hotelId: hotelA.id }), "conflict", "duplicateRegistration");

    const owner = await staff("OWNER");
    const closed = await hotels.createHotel(owner, hotel("Closed"));
    await hotels.setHotelActive(owner, closed.id, false);
    await expectError(buses.createBus(admin, { ...busInput.parse({ label: "X" }), hotelId: closed.id }), "invalid", "hotelInactive");
  });

  it("edits stops and keeps them in order", async () => {
    const admin = await staff("ADMIN");
    const { busA } = await createTwoHotels();
    for (const name of ["One", "Two", "Three"]) await buses.addStop(admin, busA.id, { name });
    let stops = (await buses.getBus(admin, busA.id)).stops;
    expect(stops.map((s) => [s.sequence, s.name])).toEqual([[1, "One"], [2, "Two"], [3, "Three"]]);

    await buses.moveStop(admin, stops[2].id, "up");
    stops = (await buses.getBus(admin, busA.id)).stops;
    expect(stops.map((s) => s.name)).toEqual(["One", "Three", "Two"]);

    await buses.removeStop(admin, stops[0].id);
    stops = (await buses.getBus(admin, busA.id)).stops;
    expect(stops.map((s) => [s.sequence, s.name])).toEqual([[1, "Three"], [2, "Two"]]);

    await buses.moveStop(admin, stops[0].id, "up"); // already first: no-op
    expect((await buses.getBus(admin, busA.id)).stops[0].name).toBe("Three");
  });

  it("lets only the owner reassign a bus's hotel or coordinator", async () => {
    const admin = await staff("ADMIN");
    const owner = await staff("OWNER");
    const { busA, busB, hotelB, coordB } = await createTwoHotels();
    await expectError(buses.reassignBusHotel(admin, busA.id, hotelB.id), "forbidden");
    await expectError(buses.assignBusCoordinator(admin, busA.id, coordB.id), "forbidden");
    await buses.reassignBusHotel(owner, busA.id, hotelB.id);
    // coordB was already busB's coordinator: one bus per coordinator moves them.
    await buses.assignBusCoordinator(owner, busA.id, coordB.id);
    const bus = await buses.getBus(owner, busA.id);
    expect(bus.hotel.id).toBe(hotelB.id);
    expect(bus.coordinator?.id).toBe(coordB.id);
    expect((await buses.getBus(owner, busB.id)).coordinator).toBeNull();
  });

  it("won't deactivate a bus that is on a trip", async () => {
    const owner = await staff("OWNER");
    const { busA, coordA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id } });
    await expectError(buses.setBusActive(owner, busA.id, false), "conflict", "busOnTrip");
  });
});

describe.skipIf(!hasTestDb)("people service", () => {
  beforeEach(resetDb);

  it("lets admins provision attendees (with a first hotel) but not staff", async () => {
    const admin = await staff("ADMIN");
    const { hotelA } = await createTwoHotels();
    const input = personCreateInput.parse({ name: "New Guest", phone: "98111 22222", role: "CUSTOMER", hotelId: hotelA.id });
    const { id } = await people.createPerson(admin, input);
    expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ phone: "+919811122222" });
    expect((await prisma.eventMember.findFirstOrThrow({ where: { userId: id } })).hotelId).toBe(hotelA.id);

    await expectError(
      people.createPerson(admin, personCreateInput.parse({ name: "X", phone: "98111 33333", role: "ADMIN" })),
      "forbidden",
    );
    // A different guest with the same number (e.g. a family member) is a new
    // person, not a duplicate -- identity is phone + name together now, not
    // phone alone.
    const sibling = await people.createPerson(admin, personCreateInput.parse({ name: "Sibling Guest", phone: "98111 22222", role: "CUSTOMER" }));
    expect(sibling.id).not.toBe(id);
    // The exact same name AND phone, still registering for this event, is the duplicate case.
    await expectError(
      people.createPerson(admin, personCreateInput.parse({ name: "New Guest", phone: "98111 22222", role: "CUSTOMER" })),
      "conflict",
      "duplicatePhone",
    );
  });

  it("stores an attendee's address but only shows it to staff and the attendee themselves", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, coordA } = await createTwoHotels();
    const input = personCreateInput.parse({ name: "Addr Guest", phone: "98111 55555", role: "CUSTOMER", hotelId: hotelA.id, address: "221B Baker St" });
    const { id } = await people.createPerson(admin, input);
    const guest = { id, role: "CUSTOMER" as const, hotelId: hotelA.id, eventId };

    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).address).toBe("221B Baker St");
    expect((await people.getPerson(admin, id)).address).toBe("221B Baker St");
    expect((await people.getPerson(guest, id)).address).toBe("221B Baker St");
    expect((await people.getPerson(coordA, id)).address).toBeUndefined();
  });

  it("shows a guest the other guests sharing their phone number, scoped to the current event, never other details", async () => {
    const { eventId, hotelB, guestA } = await createTwoHotels();
    const sibling = await createUser("CUSTOMER", { eventId, hotelId: hotelB.id });
    await prisma.user.update({ where: { id: sibling.id }, data: { phone: guestA.phone } });
    // Same phone, but a different event entirely -- must never show up.
    const otherEvent = (await createEvent("Other")).id;
    const unrelated = await createUser("CUSTOMER", { eventId: otherEvent });
    await prisma.user.update({ where: { id: unrelated.id }, data: { phone: guestA.phone } });

    const linked = await people.getLinkedGuests(guestA, guestA.phone);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ id: sibling.id, name: sibling.name, hotel: { id: hotelB.id } });
    expect(linked.some((g) => g.id === unrelated.id)).toBe(false);
    expect(linked.some((g) => g.id === guestA.id)).toBe(false);

    await expectError(people.getLinkedGuests(await staff("ADMIN"), guestA.phone), "forbidden");
  });

  it("stores and updates a guest's gender", async () => {
    const admin = await staff("ADMIN");
    const { hotelA } = await createTwoHotels();
    const input = personCreateInput.parse({ name: "Gender Guest", phone: "98111 77777", role: "CUSTOMER", hotelId: hotelA.id, gender: "Non-binary" });
    const { id } = await people.createPerson(admin, input);
    expect((await people.getPerson(admin, id)).gender).toBe("Non-binary");

    await people.updatePerson(admin, id, { name: "Gender Guest", phone: "+919811177777", address: "", gender: "Prefer not to say" });
    expect((await people.getPerson(admin, id)).gender).toBe("Prefer not to say");
  });

  it("shows medical needs to staff, the guest, and their own hotel coordinator -- wider than address", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, hotelB, coordA, coordB } = await createTwoHotels();
    const input = personCreateInput.parse({ name: "Needs Guest", phone: "98111 66666", role: "CUSTOMER", hotelId: hotelA.id, medicalNeeds: "Peanut allergy" });
    const { id } = await people.createPerson(admin, input);
    const guest = { id, role: "CUSTOMER" as const, hotelId: hotelA.id, eventId };

    expect((await people.getPerson(admin, id)).medicalNeeds).toBe("Peanut allergy");
    expect((await people.getPerson(guest, id)).medicalNeeds).toBe("Peanut allergy");
    // Unlike address, the guest's own hotel coordinator can see it (and edit it).
    const seenByCoordinator = await people.getPerson(coordA, id);
    expect(seenByCoordinator.medicalNeeds).toBe("Peanut allergy");
    expect(seenByCoordinator.canEditMedicalNeeds).toBe(true);
    // A different hotel's coordinator gets neither.
    void hotelB;
    await expectError(people.getPerson(coordB, id), "not_found");

    await people.updateMedicalNeeds(coordA, id, "Peanut allergy; carries EpiPen");
    expect((await people.getPerson(admin, id)).medicalNeeds).toBe("Peanut allergy; carries EpiPen");
    await expectError(people.updateMedicalNeeds(coordB, id, "tampered"), "forbidden");

    const filtered = await people.listPeople(admin, { hasMedicalNeeds: true });
    expect(filtered.items.map((p) => p.id)).toContain(id);
    expect(filtered.items.every((p) => p.hasMedicalNeeds)).toBe(true);
  });

  it("never lets anyone create an owner through the app", () => {
    expect(personCreateInput.safeParse({ name: "X", phone: "98111 44444", role: "OWNER" }).success).toBe(false);
  });

  it("lets admins make the first hotel allotment but only the owner change it", async () => {
    const admin = await staff("ADMIN");
    const owner = await staff("OWNER");
    const { hotelA, hotelB, guestA } = await createTwoHotels();
    await expectError(people.setPersonHotel(admin, guestA.id, hotelB.id), "forbidden");

    const unassigned = await createUser("CUSTOMER");
    await people.setPersonHotel(admin, unassigned.id, hotelA.id);
    await expectError(people.setPersonHotel(admin, unassigned.id, hotelB.id), "forbidden");

    await people.setPersonHotel(owner, guestA.id, hotelB.id);
    expect((await prisma.eventMember.findFirstOrThrow({ where: { userId: guestA.id } })).hotelId).toBe(hotelB.id);
  });

  it("stops admins editing other staff or changing roles", async () => {
    const admin = await staff("ADMIN");
    const otherAdmin = await staff("ADMIN");
    const { guestA } = await createTwoHotels();
    await expectError(people.updatePerson(admin, otherAdmin.id, { name: "Hacked", phone: otherAdmin.phone }), "forbidden");
    await expectError(people.changeRole(admin, admin.id, "OWNER"), "forbidden");
    await expectError(people.changeRole(admin, guestA.id, "ADMIN"), "forbidden");
    await expectError(people.setPersonStatus(admin, guestA.id, "INACTIVE"), "forbidden");
  });

  it("deactivation signs the person out everywhere", async () => {
    const owner = await staff("OWNER");
    const { guestA } = await createTwoHotels();
    const { token } = await createSession(guestA.id, guestA.eventId);
    await people.setPersonStatus(owner, guestA.id, "INACTIVE");
    expect(await validateSession(token)).toBeNull();
    expect((await prisma.session.findFirstOrThrow({ where: { userId: guestA.id } })).revokedAt).not.toBeNull();
    await people.setPersonStatus(owner, guestA.id, "ACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guestA.id } })).status).toBe("ACTIVE");
  });

  it("owner can't deactivate or demote themselves", async () => {
    const owner = await staff("OWNER");
    await expectError(people.setPersonStatus(owner, owner.id, "INACTIVE"), "forbidden");
    await expectError(people.changeRole(owner, owner.id, "ADMIN"), "forbidden");
  });

  it("changing a coordinator's role clears their hotel and bus designations", async () => {
    const owner = await staff("OWNER");
    const { coordA, busA, eventId } = await createTwoHotels();
    await people.changeRole(owner, coordA.id, "ADMIN");
    const membership = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: coordA.id } } });
    expect(membership?.hotelId).toBeNull();
    expect((await prisma.bus.findUniqueOrThrow({ where: { id: busA.id } })).coordinatorId).toBeNull();
  });

  it("won't change or deactivate a coordinator who is on a trip", async () => {
    const owner = await staff("OWNER");
    const { coordA, busA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id } });
    await expectError(people.changeRole(owner, coordA.id, "CUSTOMER"), "conflict", "personOnTrip");
    await expectError(people.setPersonStatus(owner, coordA.id, "INACTIVE"), "conflict", "personOnTrip");
  });

  it("changing a phone number signs the person out", async () => {
    const admin = await staff("ADMIN");
    const { guestA } = await createTwoHotels();
    const { token } = await createSession(guestA.id, guestA.eventId);
    await people.updatePerson(admin, guestA.id, { name: guestA.name, phone: "+919811155555" });
    expect(await validateSession(token)).toBeNull();
  });

  it("searches by name, phone digits and filters by role", async () => {
    const admin = await staff("ADMIN");
    const { guestA, coordA } = await createTwoHotels();
    const last4 = guestA.phone.slice(-6);
    expect((await people.listPeople(admin, { q: last4 })).items.map((p) => p.id)).toEqual([guestA.id]);
    expect((await people.listPeople(admin, { role: "COORDINATOR" })).items.map((p) => p.id)).toContain(coordA.id);
    expect((await people.listPeople(admin, { role: "COORDINATOR" })).items.every((p) => p.role === "COORDINATOR")).toBe(true);
  });

  it("customers can only open their own person record", async () => {
    const { guestA, guestB } = await createTwoHotels();
    expect((await people.getPerson(guestA, guestA.id)).id).toBe(guestA.id);
    await expectError(people.getPerson(guestA, guestB.id), "not_found");
    await expectError(people.listPeople(guestA, {}), "forbidden");
  });
});
