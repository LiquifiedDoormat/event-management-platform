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
    const { count } = await zones.bulkAssignZone(admin, { zoneId: zone.id, hotelId: hotelA.id });
    expect(count).toBe(2);
    for (const userId of [guestA.id, guestA2.id]) {
      expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId } } }))?.zoneId).toBe(zone.id);
    }
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
