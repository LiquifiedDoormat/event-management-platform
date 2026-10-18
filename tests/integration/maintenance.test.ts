import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { pruneOldData } from "@/server/services/maintenance";
import { createTwoHotels, hasTestDb, resetDb } from "./helpers";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe.skipIf(!hasTestDb)("data retention", () => {
  beforeEach(resetDb);

  it("deletes old GPS history, stale sessions and expired rate limits only", async () => {
    const { coordA, busA, guestA } = await createTwoHotels();
    const trip = await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id } });
    await prisma.locationPoint.createMany({
      data: [
        { tripId: trip.id, latitude: 1, longitude: 1, recordedAt: daysAgo(10) },
        { tripId: trip.id, latitude: 1, longitude: 1, recordedAt: daysAgo(1) },
      ],
    });
    await prisma.busLocation.create({ data: { busId: busA.id, tripId: trip.id, latitude: 1, longitude: 1, recordedAt: daysAgo(10) } });
    await prisma.session.createMany({
      data: [
        { tokenHash: "a", userId: guestA.id, expiresAt: daysAgo(8) },
        { tokenHash: "b", userId: guestA.id, expiresAt: daysAgo(-20), revokedAt: daysAgo(9) },
        { tokenHash: "c", userId: guestA.id, expiresAt: daysAgo(-20) },
      ],
    });
    await prisma.rateLimitBucket.createMany({
      data: [
        { key: "old", count: 1, windowStart: daysAgo(1), expiresAt: daysAgo(1) },
        { key: "new", count: 1, windowStart: new Date(), expiresAt: daysAgo(-1) },
      ],
    });

    expect(await pruneOldData()).toEqual({ retentionDays: 7, locationPoints: 1, sessions: 2, rateLimits: 1 });
    expect(await prisma.locationPoint.count()).toBe(1);
    expect(await prisma.busLocation.count()).toBe(1); // latest position untouched
    expect((await prisma.session.findMany()).map((s) => s.tokenHash)).toEqual(["c"]);
    expect(await pruneOldData()).toMatchObject({ locationPoints: 0, sessions: 0, rateLimits: 0 });
  });
});
