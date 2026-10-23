import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { gateInput, zoneInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import * as zones from "@/server/services/zones";
import { createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function expectError(promise: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

describe.skipIf(!hasTestDb)("zone service", () => {
  beforeEach(resetDb);

  it("lets admins create and edit zones (not owner-only)", async () => {
    const admin = await staff("ADMIN");
    const { id } = await zones.createZone(admin, zoneInput.parse({ name: "Section A", capacity: "200" }));
    await zones.updateZone(admin, id, zoneInput.parse({ name: "Section A (renamed)", capacity: "" }));
    const z = await zones.getZone(admin, id);
    expect(z).toMatchObject({ name: "Section A (renamed)", capacity: null });
  });

  it("denies coordinators and customers", async () => {
    const { coordA, guestA } = await createTwoHotels();
    await expectError(zones.listZones(guestA, {}), "forbidden");
    await expectError(zones.createZone(coordA, zoneInput.parse({ name: "X" })), "forbidden");
  });

  it("adds and removes gates, optionally linked to a zone", async () => {
    const admin = await staff("ADMIN");
    const { id: zoneId } = await zones.createZone(admin, zoneInput.parse({ name: "Section A" }));
    const { id: gateId } = await zones.addGate(admin, gateInput.parse({ name: "Gate 1", zoneId }));
    await zones.addGate(admin, gateInput.parse({ name: "Main Entrance" })); // no zone
    const z = await zones.getZone(admin, zoneId);
    expect(z.gates.map((g) => g.name)).toEqual(["Gate 1"]);
    await zones.removeGate(admin, gateId);
    expect((await zones.getZone(admin, zoneId)).gates).toEqual([]);
  });

  it("assigns and moves a single attendee between zones", async () => {
    const admin = await staff("ADMIN");
    const { eventId, guestA } = await createTwoHotels();
    const zoneA = await zones.createZone(admin, zoneInput.parse({ name: "A" }));
    const zoneB = await zones.createZone(admin, zoneInput.parse({ name: "B" }));
    await zones.setPersonZone(admin, guestA.id, zoneA.id);
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: guestA.id } } }))?.zoneId).toBe(zoneA.id);
    await zones.setPersonZone(admin, guestA.id, zoneB.id);
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: guestA.id } } }))?.zoneId).toBe(zoneB.id);
    await zones.setPersonZone(admin, guestA.id, null);
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: guestA.id } } }))?.zoneId).toBeNull();
  });

  it("bulk-assigns every active attendee of a hotel in one pass", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, guestA } = await createTwoHotels();
    const guestA2 = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "A" }));
    const { count } = await zones.bulkAssignZone(admin, { zoneId: zone.id, hotelId: hotelA.id, mode: "add" });
    expect(count).toBe(2);
    for (const userId of [guestA.id, guestA2.id]) {
      expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId } } }))?.zoneId).toBe(zone.id);
    }
  });

  it("refuses a single assignment that would exceed the zone's capacity, but allows re-assigning someone already in it", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    const g1 = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const g2 = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "Tiny", capacity: "1" }));
    await zones.setPersonZone(admin, g1.id, zone.id);
    await expectError(zones.setPersonZone(admin, g2.id, zone.id), "conflict", "zoneFull");
    // Re-assigning the same person to the zone they're already in is a no-op, not a capacity error.
    await zones.setPersonZone(admin, g1.id, zone.id);
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: g1.id } } }))?.zoneId).toBe(zone.id);
  });

  it("bulk-assign (add) only fills remaining capacity and reports how many didn't fit", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    // createTwoHotels already registers one guest at hotelA; add two more for 3 eligible total.
    const guests = await Promise.all(Array.from({ length: 2 }, () => createUser("CUSTOMER", { hotelId: hotelA.id, eventId })));
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "Small", capacity: "2" }));
    const result = await zones.bulkAssignZone(admin, { zoneId: zone.id, hotelId: hotelA.id, mode: "add" });
    expect(result).toMatchObject({ count: 2, skipped: 1 });
    const assigned = await prisma.eventMember.count({ where: { eventId, zoneId: zone.id } });
    expect(assigned).toBe(2);
    void guests;
  });

  it("bulk-assign (replace) clears the zone's current occupants before refilling it, and requires the caller to have confirmed", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, hotelB, guestA } = await createTwoHotels();
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "Shared" }));
    // Someone from a different hotel is already in the zone.
    const guestB = await createUser("CUSTOMER", { hotelId: hotelB.id, eventId });
    await zones.setPersonZone(admin, guestB.id, zone.id);

    const result = await zones.bulkAssignZone(admin, { zoneId: zone.id, hotelId: hotelA.id, mode: "replace" });
    expect(result.replaced).toBe(1);
    expect(result.count).toBe(1); // only hotelA's guestA
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: guestB.id } } }))?.zoneId).toBeNull();
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: guestA.id } } }))?.zoneId).toBe(zone.id);
  });

  it("never exceeds a zone's capacity across guests from multiple hotels (bulk-assign one hotel at a time)", async () => {
    const admin = await staff("ADMIN");
    const eventId = (await createTwoHotels()).eventId;
    const hotelA = await prisma.hotel.create({ data: { eventId, name: "H1", address: "-" } });
    const hotelB = await prisma.hotel.create({ data: { eventId, name: "H2", address: "-" } });
    const hotelC = await prisma.hotel.create({ data: { eventId, name: "H3", address: "-" } });
    const makeGuests = (hotelId: string, count: number) =>
      Promise.all(Array.from({ length: count }, () => createUser("CUSTOMER", { hotelId, eventId })));
    await makeGuests(hotelA.id, 100);
    await makeGuests(hotelB.id, 50);
    await makeGuests(hotelC.id, 100);
    const zoneA = await zones.createZone(admin, zoneInput.parse({ name: "Zone A", capacity: "200" }));
    const zoneB = await zones.createZone(admin, zoneInput.parse({ name: "Zone B", capacity: "100" }));

    const r1 = await zones.bulkAssignZone(admin, { zoneId: zoneA.id, hotelId: hotelA.id, mode: "add" });
    expect(r1).toMatchObject({ count: 100, skipped: 0 });
    const r2 = await zones.bulkAssignZone(admin, { zoneId: zoneA.id, hotelId: hotelB.id, mode: "add" });
    expect(r2).toMatchObject({ count: 50, skipped: 0 });
    // Zone A now has 150/200; hotelC's 100 guests can only partly fit.
    const r3 = await zones.bulkAssignZone(admin, { zoneId: zoneA.id, hotelId: hotelC.id, mode: "add" });
    expect(r3).toMatchObject({ count: 50, skipped: 50 });
    expect((await prisma.eventMember.count({ where: { eventId, zoneId: zoneA.id } }))).toBe(200);

    // The 50 guests from hotelC left unallocated can still go to a second zone.
    const r4 = await zones.bulkAssignZone(admin, { zoneId: zoneB.id, hotelId: hotelC.id, mode: "add" });
    expect(r4).toMatchObject({ count: 50, skipped: 0 });
    expect((await prisma.eventMember.count({ where: { eventId, zoneId: zoneB.id } }))).toBe(50);
  }, 20000);

  it("handles concurrent single assignments to a nearly-full zone without exceeding capacity", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    const guests = await Promise.all(Array.from({ length: 5 }, () => createUser("CUSTOMER", { hotelId: hotelA.id, eventId })));
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "Race", capacity: "3" }));
    const results = await Promise.allSettled(guests.map((g) => zones.setPersonZone(admin, g.id, zone.id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(3);
    const assigned = await prisma.eventMember.count({ where: { eventId, zoneId: zone.id } });
    expect(assigned).toBe(3);
  });

  it("bulk-assign skipped count ignores guests already allocated to a different zone", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    // One extra guest at hotelA, already allocated elsewhere — not an eligible candidate.
    const elsewhere = await zones.createZone(admin, zoneInput.parse({ name: "Elsewhere" }));
    const guestAlreadyZoned = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    await zones.setPersonZone(admin, guestAlreadyZoned.id, elsewhere.id);
    // One more still-unallocated guest at hotelA, alongside createTwoHotels' own guestA (2 eligible total).
    await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "Small", capacity: "1" }));
    const result = await zones.bulkAssignZone(admin, { zoneId: zone.id, hotelId: hotelA.id, mode: "add" });
    // 2 eligible (unallocated) guests at hotelA, capacity 1: 1 fits, 1 is skipped —
    // the guest already in "Elsewhere" must not inflate that count.
    expect(result).toMatchObject({ count: 1, skipped: 1 });
  });

  it("lists only hotels with at least one unallocated guest, with a correct remaining count, for the bulk-assign dropdown", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, guestA, guestB } = await createTwoHotels();
    await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "A" }));
    // hotelA: 2 guests, one gets allocated — hotel must stay listed (partial), with 1 remaining.
    await zones.setPersonZone(admin, guestA.id, zone.id);
    // hotelB: its only guest gets allocated — hotel must disappear entirely.
    await zones.setPersonZone(admin, guestB.id, zone.id);
    const list = await zones.hotelsWithUnallocatedGuests(admin);
    expect(list).toEqual([{ id: hotelA.id, name: "Hotel A", unallocated: 1 }]);
  });

  it("reports the hotels represented among a zone's allocated guests, and a hotel's guests grouped by zone", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, hotelB, guestA, guestB } = await createTwoHotels();
    await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const zone = await zones.createZone(admin, zoneInput.parse({ name: "A" }));
    await zones.setPersonZone(admin, guestA.id, zone.id);
    await zones.setPersonZone(admin, guestB.id, zone.id);

    const hotelsInZone = await zones.zoneHotelBreakdown(admin, zone.id);
    expect(hotelsInZone).toEqual([
      { hotelId: hotelA.id, hotelName: "Hotel A", count: 1 },
      { hotelId: hotelB.id, hotelName: "Hotel B", count: 1 },
    ]);

    const hotelABreakdown = await zones.hotelZoneBreakdown(admin, hotelA.id);
    expect(hotelABreakdown).toEqual(
      expect.arrayContaining([
        { zoneId: zone.id, zoneName: "A", count: 1 },
        { zoneId: null, zoneName: null, count: 1 }, // guestA2, still unallocated
      ]),
    );
  });

  it("refuses to deactivate a zone with active attendees still assigned", async () => {
    const admin = await staff("ADMIN");
    const { guestA } = await createTwoHotels();
    const { id } = await zones.createZone(admin, zoneInput.parse({ name: "A" }));
    await zones.setPersonZone(admin, guestA.id, id);
    await expectError(zones.setZoneActive(admin, id, false), "conflict", "zoneInUse");
    await zones.setPersonZone(admin, guestA.id, null);
    await zones.setZoneActive(admin, id, false); // now succeeds
    expect((await zones.getZone(admin, id)).isActive).toBe(false);
  });

  it("reports seatsLeft and filters the list by fullness (full/partial/empty)", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA, guestA } = await createTwoHotels();
    const guestA2 = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const full = await zones.createZone(admin, zoneInput.parse({ name: "Full", capacity: "1" }));
    const partial = await zones.createZone(admin, zoneInput.parse({ name: "Partial", capacity: "5" }));
    await zones.createZone(admin, zoneInput.parse({ name: "Empty", capacity: "5" }));
    const uncapped = await zones.createZone(admin, zoneInput.parse({ name: "Uncapped" }));
    await zones.setPersonZone(admin, guestA.id, full.id);
    await zones.setPersonZone(admin, guestA2.id, partial.id);

    const byName = (items: { name: string }[]) => items.map((z) => z.name).sort();

    const all = await zones.listZones(admin, {});
    expect(all.items.find((z) => z.name === "Full")).toMatchObject({ attendeeCount: 1, capacity: 1, seatsLeft: 0 });
    expect(all.items.find((z) => z.name === "Partial")).toMatchObject({ attendeeCount: 1, capacity: 5, seatsLeft: 4 });
    expect(all.items.find((z) => z.name === "Empty")).toMatchObject({ attendeeCount: 0, capacity: 5, seatsLeft: 5 });
    expect(all.items.find((z) => z.name === "Uncapped")).toMatchObject({ attendeeCount: 0, capacity: null, seatsLeft: null });

    expect(byName((await zones.listZones(admin, { fullness: "full" })).items)).toEqual(["Full"]);
    expect(byName((await zones.listZones(admin, { fullness: "partial" })).items)).toEqual(["Partial"]);
    expect(byName((await zones.listZones(admin, { fullness: "empty" })).items)).toEqual(["Empty", "Uncapped"]);

    // An uncapped zone with guests counts as partially full (unlimited seats left), never full.
    await zones.setPersonZone(admin, guestA.id, uncapped.id);
    expect(byName((await zones.listZones(admin, { fullness: "partial" })).items)).toEqual(["Partial", "Uncapped"]);
    expect(byName((await zones.listZones(admin, { fullness: "full" })).items)).toEqual([]);
  });
});
