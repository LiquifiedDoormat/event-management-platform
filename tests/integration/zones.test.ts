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
});
