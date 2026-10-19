import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/server/errors";
import { getLiveBus } from "@/server/services/transport";
import { changeStatus, endTrip, recordLocation, setSharing, startTrip } from "@/server/services/trips";
import { createTwoHotels, hasTestDb, resetDb, staff } from "./helpers";


async function rejects(p: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

const reading = (tripId: string, offsetMs = 0, lat = 12.97) => ({
  tripId,
  latitude: lat,
  longitude: 77.59,
  accuracy: 12,
  recordedAt: Date.now() + offsetMs,
});

describe.skipIf(!hasTestDb)("trips, status and GPS", () => {
  beforeEach(resetDb);

  it("lets a coordinator start a trip on their bus", async () => {
    const { coordA, busA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
    expect(trip).toMatchObject({ coordinatorId: coordA.id, status: "BOARDING", statusVersion: 0, endedAt: null });
    expect(await prisma.busStatusEvent.count({ where: { tripId: id } })).toBe(1);
  });

  it("refuses unrelated coordinators, attendees and a second active trip", async () => {
    const { coordA, coordB, busA, busB, guestA } = await createTwoHotels();
    await rejects(startTrip(coordB, busA.id), "forbidden");
    await rejects(startTrip(guestA, busA.id), "forbidden");
    await startTrip(coordA, busA.id);
    const admin = await staff("ADMIN");
    await rejects(startTrip(admin, busA.id), "conflict", "busOnTrip");
    // coordA also designated to busB → still only one trip at a time.
    await prisma.bus.update({ where: { id: busB.id }, data: { coordinatorId: coordA.id } });
    await rejects(startTrip(coordA, busB.id), "conflict", "coordinatorOnTrip");
  });

  it("lets staff start a trip for the bus's designated coordinator", async () => {
    const { coordB, busB } = await createTwoHotels();
    const admin = await staff("ADMIN");
    const { id } = await startTrip(admin, busB.id);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id } })).coordinatorId).toBe(coordB.id);
  });

  it("changes status with version checks and records history", async () => {
    const { coordA, coordB, busA, guestA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    expect(await changeStatus(coordA, id, "TO_STOP", 0)).toEqual({ version: 1 });
    // A second phone still showing version 0 must not overwrite the newer status.
    await rejects(changeStatus(coordA, id, "AT_HOTEL", 0), "conflict", "staleStatus");
    await rejects(changeStatus(coordB, id, "AT_STOP", 1), "forbidden");
    await rejects(changeStatus(guestA, id, "AT_STOP", 1), "forbidden");
    // Same status again is a harmless no-op (double tap).
    expect(await changeStatus(coordA, id, "TO_STOP", 1)).toEqual({ version: 1 });
    expect(await prisma.busStatusEvent.count({ where: { tripId: id } })).toBe(2);
  });

  it("lets staff correct a status, with an audit entry", async () => {
    const { coordA, busA } = await createTwoHotels();
    const admin = await staff("ADMIN");
    const { id } = await startTrip(coordA, busA.id);
    await changeStatus(admin, id, "AT_HOTEL", 0);
    expect(await prisma.auditLog.count({ where: { action: "trip.correctStatus", entityId: id } })).toBe(1);
  });

  it("accepts GPS only from the trip's coordinator and only newer readings", async () => {
    const { coordA, coordB, busA, guestA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    await rejects(recordLocation(coordB, reading(id)), "forbidden");
    await rejects(recordLocation(guestA, reading(id)), "forbidden");

    expect(await recordLocation(coordA, reading(id, -5_000, 12.97))).toEqual({ accepted: true });
    // An older reading arriving late is ignored, not stored.
    expect(await recordLocation(coordA, reading(id, -10_000, 13.5))).toEqual({ accepted: false, reason: "outOfOrder" });
    // An exact duplicate is ignored too.
    const loc = await prisma.busLocation.findUniqueOrThrow({ where: { busId: busA.id } });
    expect(loc.latitude).toBe(12.97);
    expect(await recordLocation(coordA, { ...reading(id), recordedAt: loc.recordedAt.getTime() })).toEqual({
      accepted: false,
      reason: "outOfOrder",
    });

    expect((await prisma.trip.findUniqueOrThrow({ where: { id } })).sharingLocation).toBe(true);
  });

  it("rejects readings from the future and ignores very old ones", async () => {
    const { coordA, busA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    await rejects(recordLocation(coordA, reading(id, 10 * 60_000)), "invalid", "clockAhead");
    expect(await recordLocation(coordA, reading(id, -60 * 60_000))).toEqual({ accepted: false, reason: "tooOld" });
  });

  it("samples history instead of storing every reading", async () => {
    const { coordA, busA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    for (const offset of [-50_000, -40_000, -30_000, -20_000, -10_000, 0]) {
      await recordLocation(coordA, reading(id, offset));
    }
    // 30 s sampling over 50 s of readings → 2 history points, latest position stored once.
    expect(await prisma.locationPoint.count({ where: { tripId: id } })).toBe(2);
    expect(await prisma.busLocation.count()).toBe(1);
  });

  it("ending a trip stops tracking, removes the live position and blocks further updates", async () => {
    const { coordA, busA, guestA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    await recordLocation(coordA, reading(id));
    await endTrip(coordA, id);
    expect(await prisma.busLocation.count({ where: { busId: busA.id } })).toBe(0);
    await rejects(recordLocation(coordA, reading(id, 1000)), "conflict", "tripEnded");
    await rejects(changeStatus(coordA, id, "AT_STOP", 0), "conflict", "tripEnded");
    expect(await getLiveBus(guestA, busA.id)).toEqual({ busId: busA.id, trip: null, location: null });

    // History survives; a new trip starts clean.
    expect(await prisma.locationPoint.count({ where: { tripId: id } })).toBe(1);
    const next = await startTrip(coordA, busA.id);
    expect(next.id).not.toBe(id);
  });

  it("only the trip coordinator toggles sharing; attendees can't end trips", async () => {
    const { coordA, busA, guestA } = await createTwoHotels();
    const { id } = await startTrip(coordA, busA.id);
    await setSharing(coordA, id, true);
    await rejects(setSharing(guestA, id, false), "forbidden");
    await rejects(endTrip(guestA, id), "forbidden");
  });

  it("live snapshot is scoped like the tracking page", async () => {
    const { guestA, busB } = await createTwoHotels();
    await rejects(getLiveBus(guestA, busB.id), "not_found");
  });
});
