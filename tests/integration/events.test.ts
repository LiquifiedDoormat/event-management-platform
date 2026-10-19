import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createSession, validateSession } from "@/lib/auth/session";
import { hotelInput, personCreateInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import * as hotels from "@/server/services/hotels";
import * as buses from "@/server/services/buses";
import * as people from "@/server/services/people";
import * as events from "@/server/services/events";
import { getEventOverview } from "@/server/services/dashboard";
import { getLiveBus, getTrackedBus } from "@/server/services/transport";
import { recordLocation, startTrip } from "@/server/services/trips";
import { createEvent, createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function code(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return { code: (err as AppError).code, reason: (err as AppError).reason };
}

/** Two independent events, each with its own hotels, buses, coordinators and attendees. */
async function twoEvents() {
  const e1 = await createEvent("Event one");
  const e2 = await createEvent("Event two");
  const one = await createTwoHotels(e1.id);
  const two = await createTwoHotels(e2.id);
  return { e1: e1.id, e2: e2.id, one, two };
}

describe.skipIf(!hasTestDb)("event isolation", () => {
  beforeEach(resetDb);

  it("staff directories, details and counts only show the selected event", async () => {
    const { e1, e2, one, two } = await twoEvents();
    const admin1 = await staff("ADMIN", e1);
    const names = (await hotels.listHotels(admin1, {})).items.map((h) => h.id);
    expect(names.sort()).toEqual([one.hotelA.id, one.hotelB.id].sort());
    expect((await buses.listBuses(admin1, {})).items.map((b) => b.id)).not.toContain(two.busA.id);
    expect((await code(hotels.getHotel(admin1, two.hotelA.id))).code).toBe("not_found");
    expect((await code(buses.getBus(admin1, two.busA.id))).code).toBe("not_found");
    const peopleIds = (await people.listPeople(admin1, {})).items.map((p) => p.id);
    expect(peopleIds).toContain(one.guestA.id);
    expect(peopleIds).not.toContain(two.guestA.id);
    expect((await code(people.getPerson(admin1, two.guestA.id))).code).toBe("not_found");
    expect(await getEventOverview(admin1)).toMatchObject({ hotels: 2, buses: 2, attendees: 2, coordinators: 2 });
    // Search can't reach the other event either.
    expect((await people.listPeople(admin1, { q: two.guestA.phone.slice(-6) })).items).toEqual([]);
    // Same admin in event two sees event two.
    expect((await hotels.listHotels({ ...admin1, eventId: e2 }, {})).items.map((h) => h.id)).toContain(two.hotelA.id);
  });

  it("can't assign across events (hotels, coordinators, attendees)", async () => {
    const { e1, one, two } = await twoEvents();
    const owner = await staff("OWNER", e1);
    expect((await code(hotels.assignHotelCoordinator(owner, one.hotelA.id, two.coordA.id))).reason).toBe("notActiveCoordinator");
    expect((await code(buses.reassignBusHotel(owner, one.busA.id, two.hotelA.id))).reason).toBe("hotelInactive");
    expect((await code(people.setPersonHotel(owner, one.guestA.id, two.hotelA.id))).reason).toBe("hotelInactive");
    expect((await code(buses.createBus(owner, { label: "X", registration: undefined, hotelId: two.hotelA.id }))).reason).toBe("hotelInactive");
  });

  it("attendees and coordinators only see their own event's buses; GPS can't cross events", async () => {
    const { one, two } = await twoEvents();
    expect((await code(getTrackedBus(one.guestA, two.busA.id))).code).toBe("not_found");
    expect((await code(getLiveBus(one.guestA, two.busA.id))).code).toBe("not_found");
    expect((await code(startTrip(one.coordA, two.busA.id))).code).toBe("forbidden");
    // A trip in event two can't receive GPS from a coordinator working in event one.
    const trip = await startTrip(two.coordA, two.busA.id);
    const reading = { tripId: trip.id, latitude: 12.9, longitude: 77.6, accuracy: 10, recordedAt: Date.now() };
    expect((await code(recordLocation({ ...two.coordA, eventId: one.eventId }, reading))).code).toBe("not_found");
    expect(await recordLocation(two.coordA, reading)).toEqual({ accepted: true });
  });

  it("a person can be registered for two events with a different hotel in each", async () => {
    const { e1, e2, one, two } = await twoEvents();
    const admin2 = await staff("ADMIN", e2);
    const again = await people.createPerson(admin2, personCreateInput.parse({ name: "x", phone: one.guestA.phone, role: "CUSTOMER", hotelId: two.hotelA.id }));
    expect(again).toEqual({ id: one.guestA.id, addedExisting: true });
    const memberships = await prisma.eventMember.findMany({ where: { userId: one.guestA.id }, orderBy: { eventId: "asc" } });
    expect(Object.fromEntries(memberships.map((m) => [m.eventId, m.hotelId]))).toEqual({ [e1]: one.hotelA.id, [e2]: two.hotelA.id });
  });
});

describe.skipIf(!hasTestDb)("event management and switching", () => {
  beforeEach(resetDb);

  it("admins create and edit any event; only the owner deactivates; others can't", async () => {
    const admin = await staff("ADMIN");
    const owner = await staff("OWNER");
    const coord = await createUser("COORDINATOR");
    const { id } = await events.createEvent(admin, events.eventInput.parse({ name: "New expo", startsOn: "2026-12-01", endsOn: "2026-12-03" }));
    await events.updateEvent(admin, id, events.eventInput.parse({ name: "New expo 2026", startsOn: "2026-12-01" }));
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).name).toBe("New expo 2026");
    expect((await code(events.setEventActive(admin, id, false))).code).toBe("forbidden");
    await events.setEventActive(owner, id, false);
    expect((await code(events.createEvent(coord, events.eventInput.parse({ name: "X" })))).code).toBe("forbidden");
    expect(events.eventInput.safeParse({ name: "X", startsOn: "2026-12-03", endsOn: "2026-12-01" }).success).toBe(false);
  });

  it("switching is checked on the server and never grants access to other events", async () => {
    const { e1, e2, one } = await twoEvents();
    const admin = await staff("ADMIN", e1);
    const adminSession = await createSession(admin.id, e1);
    const s1 = (await validateSession(adminSession.token))!;
    await events.switchEvent(s1.user, s1.sessionId, e2);
    expect((await validateSession(adminSession.token))?.user.eventId).toBe(e2);

    const guestSession = await createSession(one.guestA.id, e1);
    const g = (await validateSession(guestSession.token))!;
    expect((await code(events.switchEvent(g.user, g.sessionId, e2))).code).toBe("not_found");
    expect((await validateSession(guestSession.token))?.user.eventId).toBe(e1);
    // Membership is unchanged by the attempt.
    expect(await prisma.eventMember.count({ where: { userId: one.guestA.id } })).toBe(1);
  });

  it("deactivating an event signs its attendees and coordinators out of it", async () => {
    const { e1, one } = await twoEvents();
    const s = await createSession(one.guestA.id, e1);
    await prisma.event.update({ where: { id: e1 }, data: { isActive: false } });
    expect(await validateSession(s.token)).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("PIN resets", () => {
  beforeEach(resetDb);

  it("new admins and coordinators start without a PIN (they choose one at first sign-in)", async () => {
    const owner = await staff("OWNER");
    const c = await people.createPerson(owner, personCreateInput.parse({ name: "C", phone: "98111 60001", role: "COORDINATOR" }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: c.id } })).pinHash).toBeNull();
    expect((await people.getPerson(owner, c.id)).pin).toEqual({ isSet: false, lockedUntil: null });
  });

  it("only authorized staff can reset PINs; a reset clears the PIN and lockout", async () => {
    const owner = await staff("OWNER");
    const admin = await staff("ADMIN");
    const otherAdmin = await staff("ADMIN");
    const { coordA, guestA } = await createTwoHotels();
    await prisma.user.update({ where: { id: coordA.id }, data: { pinHash: "scrypt$x", failedPinAttempts: 5, pinLockedUntil: new Date(Date.now() + 60_000) } });
    await people.resetPin(admin, coordA.id);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: coordA.id } })).toMatchObject({ pinHash: null, failedPinAttempts: 0, pinLockedUntil: null });
    expect((await code(people.resetPin(admin, otherAdmin.id))).code).toBe("forbidden");
    expect((await code(people.resetPin(admin, owner.id))).code).toBe("forbidden");
    expect((await code(people.resetPin(owner, guestA.id))).code).toBe("forbidden");
    expect((await code(people.resetPin(coordA, coordA.id))).code).toBe("forbidden");
    await people.resetPin(owner, otherAdmin.id);
    expect(await prisma.auditLog.count({ where: { action: "person.resetPin" } })).toBe(2);
  });
});

describe.skipIf(!hasTestDb)("coordinator attendee list", () => {
  beforeEach(resetDb);

  it("lists and searches only attendees of the coordinator's hotels in the current event", async () => {
    const { one, two } = await twoEvents();
    const extra = await createUser("CUSTOMER", { hotelId: one.hotelA.id, eventId: one.eventId });
    const mine = await people.listMyAttendees(one.coordA, {});
    expect(mine.items.map((p) => p.id).sort()).toEqual([one.guestA.id, extra.id].sort());
    expect(mine.items.every((p) => p.hotel?.id === one.hotelA.id)).toBe(true);
    expect((await people.listMyAttendees(one.coordA, { q: one.guestB.phone.slice(-6) })).items).toEqual([]);
    expect((await people.listMyAttendees(one.coordA, { q: two.guestA.name })).items).toEqual([]);
    expect((await people.listMyAttendees(one.coordA, { q: extra.phone.slice(-6) })).items.map((p) => p.id)).toEqual([extra.id]);
    expect((await code(people.listMyAttendees(one.guestA, {}))).code).toBe("forbidden");
  });

  it("paginates", async () => {
    const { hotelA, coordA, eventId } = await createTwoHotels();
    for (let i = 0; i < 26; i++) await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const first = await people.listMyAttendees(coordA, {});
    expect(first.items).toHaveLength(25);
    expect((await people.listMyAttendees(coordA, { cursor: first.nextCursor! })).items).toHaveLength(2);
  });
});

describe.skipIf(!hasTestDb)("attendees are read-only", () => {
  beforeEach(resetDb);

  it("attendee sessions can't change anything", async () => {
    const { guestA, hotelA, busA } = await createTwoHotels();
    const attempts = [
      () => hotels.updateHotel(guestA, hotelA.id, hotelInput.parse({ name: "x", address: "y" })),
      () => buses.addStop(guestA, busA.id, { name: "x" }),
      () => people.updatePerson(guestA, guestA.id, { name: "x", phone: guestA.phone }),
      () => people.setPersonHotel(guestA, guestA.id, null),
      () => startTrip(guestA, busA.id),
      () => events.createEvent(guestA, events.eventInput.parse({ name: "x" })),
    ];
    for (const attempt of attempts) {
      expect((await code(attempt())).code).toMatch(/forbidden|not_found/);
    }
  });
});
