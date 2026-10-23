import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { clusterInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import { getOpsDashboard } from "@/server/services/dashboard";
import * as clusters from "@/server/services/clusters";
import { createEvent, createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function forbiddenErr(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe("forbidden");
}

describe.skipIf(!hasTestDb)("ops dashboard", () => {
  beforeEach(resetDb);

  it("refuses non-staff actors", async () => {
    const { guestA } = await createTwoHotels();
    await forbiddenErr(getOpsDashboard(guestA));
  });

  it("summarizes the whole fleet regardless of filters, and lists only filtered buses", async () => {
    const { eventId, coordA, busA, hotelA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id, status: "DEPARTED_VENUE", isDelayed: true } });
    // busB has no active trip -> notRunning.
    const admin = await staff("ADMIN", eventId);

    const all = await getOpsDashboard(admin);
    expect(all.summary).toMatchObject({ moving: 1, notRunning: 1, delayed: 1, total: 2 });
    expect(all.buses).toHaveLength(2);

    const movingOnly = await getOpsDashboard(admin, { statusKind: "moving" });
    expect(movingOnly.summary.total).toBe(2); // summary always reflects the whole fleet
    expect(movingOnly.buses.map((b) => b.id)).toEqual([busA.id]);

    const delayedOnly = await getOpsDashboard(admin, { delayedOnly: true });
    expect(delayedOnly.buses.map((b) => b.id)).toEqual([busA.id]);

    const byHotel = await getOpsDashboard(admin, { hotelId: hotelA.id });
    expect(byHotel.buses.map((b) => b.id)).toEqual([busA.id]);
  });

  it("excludes inactive buses and buses outside the actor's event", async () => {
    const { eventId, busA } = await createTwoHotels();
    await prisma.bus.update({ where: { id: busA.id }, data: { isActive: false } });
    const admin = await staff("ADMIN", eventId);
    const { buses } = await getOpsDashboard(admin);
    expect(buses).toHaveLength(1);

    const otherEvent = await createEvent();
    await createTwoHotels(otherEvent.id);
    const otherAdmin = await staff("ADMIN", otherEvent.id);
    expect((await getOpsDashboard(otherAdmin)).buses).toHaveLength(2);
  });

  it("scopes a cluster coordinator to their own cluster's buses only, in both summary and the bus list — and still refuses a hotel coordinator", async () => {
    const owner = await staff("OWNER");
    const eventId = owner.eventId!;
    const { hotelA, hotelB, busA, busB, coordA } = await createTwoHotels(eventId);
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id, status: "DEPARTED_VENUE", isDelayed: true } });
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc.id);

    const dashboard = await getOpsDashboard(cc);
    // Only hotelA (in their cluster) is counted/listed — hotelB's bus never appears or contributes to the summary.
    expect(dashboard.summary).toMatchObject({ moving: 1, notRunning: 0, delayed: 1, total: 1 });
    expect(dashboard.buses.map((b) => b.id)).toEqual([busA.id]);
    expect(dashboard.hotelOptions.map((h) => h.id)).toEqual([hotelA.id]);
    expect(dashboard.clusterOptions.map((c) => c.id)).toEqual([north.id]);

    // A clusterId/hotelId from outside their cluster can't be used to widen the result (already excluded upstream).
    expect((await getOpsDashboard(cc, { hotelId: hotelB.id })).buses).toHaveLength(0);

    // A cluster coordinator not yet assigned to any cluster sees nothing, not an error.
    const unassignedCc = await createUser("CLUSTER_COORDINATOR", { eventId });
    const empty = await getOpsDashboard(unassignedCc);
    expect(empty.summary.total).toBe(0);
    expect(empty.buses).toHaveLength(0);

    // Existing permissions unchanged: a hotel coordinator still has no ops-dashboard access.
    await forbiddenErr(getOpsDashboard(coordA));
    void busB;
  });
});
