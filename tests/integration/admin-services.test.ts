import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createSession, validateSession } from "@/lib/auth/session";
import { busInput, hotelInput, personCreateInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import * as hotels from "@/server/services/hotels";
import * as buses from "@/server/services/buses";
import * as people from "@/server/services/people";
import { createTwoHotels, createUser, hasTestDb, resetDb } from "./helpers";

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
    const admin = await createUser("ADMIN");
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
    const admin = await createUser("ADMIN");
    const { hotelA, coordB } = await createTwoHotels();
    await expectError(hotels.setHotelActive(admin, hotelA.id, false), "forbidden");
    await expectError(hotels.assignHotelCoordinator(admin, hotelA.id, coordB.id), "forbidden");
  });

  it("denies customers and coordinators", async () => {
    const { guestA, coordA, hotelA } = await createTwoHotels();
    await expectError(hotels.listHotels(guestA, {}), "forbidden");
    await expectError(hotels.getHotel(coordA, hotelA.id), "forbidden");
    await expectError(hotels.createHotel(coordA, hotel("Z")), "forbidden");
  });

  it("moves a coordinator between hotels, keeping one hotel per coordinator", async () => {
    const owner = await createUser("OWNER");
    const { hotelA, hotelB, coordA } = await createTwoHotels();
    await hotels.assignHotelCoordinator(owner, hotelB.id, coordA.id);
    expect((await prisma.hotel.findUniqueOrThrow({ where: { id: hotelB.id } })).coordinatorId).toBe(coordA.id);
    expect((await prisma.hotel.findUniqueOrThrow({ where: { id: hotelA.id } })).coordinatorId).toBeNull();
  });

  it("only assigns active coordinators", async () => {
    const owner = await createUser("OWNER");
    const { hotelA, guestA } = await createTwoHotels();
    await expectError(hotels.assignHotelCoordinator(owner, hotelA.id, guestA.id), "invalid", "notActiveCoordinator");
  });

  it("won't deactivate a hotel that still has buses or attendees", async () => {
    const owner = await createUser("OWNER");
    const { hotelA } = await createTwoHotels();
    await expectError(hotels.setHotelActive(owner, hotelA.id, false), "conflict", "hotelInUse");
    const empty = await hotels.createHotel(owner, hotel("Empty"));
    await hotels.setHotelActive(owner, empty.id, false);
    expect((await hotels.listHotels(owner, {})).items.map((h) => h.name)).not.toContain("Empty");
  });

  it("paginates and searches", async () => {
    const admin = await createUser("ADMIN");
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
    const admin = await createUser("ADMIN");
    const { hotelA } = await createTwoHotels();
    const input = busInput.parse({ label: "Bus 9", registration: "ka 01 ab 1234" });
    const { id } = await buses.createBus(admin, { ...input, hotelId: hotelA.id });
    expect((await buses.getBus(admin, id)).registration).toBe("KA01AB1234");
    await expectError(buses.createBus(admin, { ...input, hotelId: hotelA.id }), "conflict", "duplicateRegistration");

    const owner = await createUser("OWNER");
    const closed = await hotels.createHotel(owner, hotel("Closed"));
    await hotels.setHotelActive(owner, closed.id, false);
    await expectError(buses.createBus(admin, { ...busInput.parse({ label: "X" }), hotelId: closed.id }), "invalid", "hotelInactive");
  });

  it("edits stops and keeps them in order", async () => {
    const admin = await createUser("ADMIN");
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
    const admin = await createUser("ADMIN");
    const owner = await createUser("OWNER");
    const { busA, hotelB, coordB } = await createTwoHotels();
    await expectError(buses.reassignBusHotel(admin, busA.id, hotelB.id), "forbidden");
    await expectError(buses.assignBusCoordinator(admin, busA.id, coordB.id), "forbidden");
    await buses.reassignBusHotel(owner, busA.id, hotelB.id);
    await buses.assignBusCoordinator(owner, busA.id, coordB.id);
    const bus = await buses.getBus(owner, busA.id);
    expect(bus.hotel.id).toBe(hotelB.id);
    expect(bus.coordinator?.id).toBe(coordB.id);
  });

  it("won't deactivate a bus that is on a trip", async () => {
    const owner = await createUser("OWNER");
    const { busA, coordA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id } });
    await expectError(buses.setBusActive(owner, busA.id, false), "conflict", "busOnTrip");
  });
});

describe.skipIf(!hasTestDb)("people service", () => {
  beforeEach(resetDb);

  it("lets admins provision attendees (with a first hotel) but not staff", async () => {
    const admin = await createUser("ADMIN");
    const { hotelA } = await createTwoHotels();
    const input = personCreateInput.parse({ name: "New Guest", phone: "98111 22222", role: "CUSTOMER", hotelId: hotelA.id });
    const { id } = await people.createPerson(admin, input);
    expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ phone: "+919811122222", hotelId: hotelA.id });

    await expectError(
      people.createPerson(admin, personCreateInput.parse({ name: "X", phone: "98111 33333", role: "ADMIN" })),
      "forbidden",
    );
    await expectError(
      people.createPerson(admin, personCreateInput.parse({ name: "Dup", phone: "98111 22222", role: "CUSTOMER" })),
      "conflict",
      "duplicatePhone",
    );
  });

  it("never lets anyone create an owner through the app", () => {
    expect(personCreateInput.safeParse({ name: "X", phone: "98111 44444", role: "OWNER" }).success).toBe(false);
  });

  it("lets admins make the first hotel allotment but only the owner change it", async () => {
    const admin = await createUser("ADMIN");
    const owner = await createUser("OWNER");
    const { hotelA, hotelB, guestA } = await createTwoHotels();
    await expectError(people.setPersonHotel(admin, guestA.id, hotelB.id), "forbidden");

    const unassigned = await createUser("CUSTOMER");
    await people.setPersonHotel(admin, unassigned.id, hotelA.id);
    await expectError(people.setPersonHotel(admin, unassigned.id, hotelB.id), "forbidden");

    await people.setPersonHotel(owner, guestA.id, hotelB.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guestA.id } })).hotelId).toBe(hotelB.id);
  });

  it("stops admins editing other staff or changing roles", async () => {
    const admin = await createUser("ADMIN");
    const otherAdmin = await createUser("ADMIN");
    const { guestA } = await createTwoHotels();
    await expectError(people.updatePerson(admin, otherAdmin.id, { name: "Hacked", phone: otherAdmin.phone }), "forbidden");
    await expectError(people.changeRole(admin, admin.id, "OWNER"), "forbidden");
    await expectError(people.changeRole(admin, guestA.id, "ADMIN"), "forbidden");
    await expectError(people.setPersonStatus(admin, guestA.id, "INACTIVE"), "forbidden");
  });

  it("deactivation signs the person out everywhere", async () => {
    const owner = await createUser("OWNER");
    const { guestA } = await createTwoHotels();
    const { token } = await createSession(guestA.id);
    await people.setPersonStatus(owner, guestA.id, "INACTIVE");
    expect(await validateSession(token)).toBeNull();
    expect((await prisma.session.findFirstOrThrow({ where: { userId: guestA.id } })).revokedAt).not.toBeNull();
    await people.setPersonStatus(owner, guestA.id, "ACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guestA.id } })).status).toBe("ACTIVE");
  });

  it("owner can't deactivate or demote themselves", async () => {
    const owner = await createUser("OWNER");
    await expectError(people.setPersonStatus(owner, owner.id, "INACTIVE"), "forbidden");
    await expectError(people.changeRole(owner, owner.id, "ADMIN"), "forbidden");
  });

  it("changing a coordinator's role clears their hotel and bus designations", async () => {
    const owner = await createUser("OWNER");
    const { coordA, hotelA, busA } = await createTwoHotels();
    await people.changeRole(owner, coordA.id, "ADMIN");
    expect((await prisma.hotel.findUniqueOrThrow({ where: { id: hotelA.id } })).coordinatorId).toBeNull();
    expect((await prisma.bus.findUniqueOrThrow({ where: { id: busA.id } })).coordinatorId).toBeNull();
  });

  it("won't change or deactivate a coordinator who is on a trip", async () => {
    const owner = await createUser("OWNER");
    const { coordA, busA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id } });
    await expectError(people.changeRole(owner, coordA.id, "CUSTOMER"), "conflict", "personOnTrip");
    await expectError(people.setPersonStatus(owner, coordA.id, "INACTIVE"), "conflict", "personOnTrip");
  });

  it("changing a phone number signs the person out", async () => {
    const admin = await createUser("ADMIN");
    const { guestA } = await createTwoHotels();
    const { token } = await createSession(guestA.id);
    await people.updatePerson(admin, guestA.id, { name: guestA.name, phone: "+919811155555" });
    expect(await validateSession(token)).toBeNull();
  });

  it("searches by name, phone digits and filters by role", async () => {
    const admin = await createUser("ADMIN");
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
