import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { clusterInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import { loadScope } from "@/server/policies/scope";
import { canViewBus, canViewHotel, canViewPerson } from "@/server/policies";
import * as clusters from "@/server/services/clusters";
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

describe.skipIf(!hasTestDb)("cluster service", () => {
  beforeEach(resetDb);

  it("lets admins create and edit clusters (not owner-only)", async () => {
    const admin = await staff("ADMIN");
    const { id } = await clusters.createCluster(admin, clusterInput.parse({ name: "North Zone" }));
    await clusters.updateCluster(admin, id, clusterInput.parse({ name: "North Zone (renamed)" }));
    const c = await clusters.getCluster(admin, id);
    expect(c.name).toBe("North Zone (renamed)");
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(2);
  });

  it("denies coordinators and customers", async () => {
    const { coordA, guestA } = await createTwoHotels();
    await expectError(clusters.listClusters(guestA, {}), "forbidden");
    await expectError(clusters.createCluster(coordA, clusterInput.parse({ name: "X" })), "forbidden");
  });

  it("adds and moves hotels between clusters (a hotel belongs to at most one)", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    const north = await clusters.createCluster(admin, clusterInput.parse({ name: "North" }));
    const south = await clusters.createCluster(admin, clusterInput.parse({ name: "South" }));
    await clusters.addClusterHotel(admin, north.id, hotelA.id);
    expect((await clusters.getCluster(admin, north.id)).hotels.map((h) => h.id)).toContain(hotelA.id);

    await clusters.addClusterHotel(admin, south.id, hotelA.id);
    expect((await clusters.getCluster(admin, north.id)).hotels.map((h) => h.id)).not.toContain(hotelA.id);
    expect((await clusters.getCluster(admin, south.id)).hotels.map((h) => h.id)).toContain(hotelA.id);

    await clusters.removeClusterHotel(admin, south.id, hotelA.id);
    expect((await clusters.getCluster(admin, south.id)).hotels).toHaveLength(0);
    void eventId;
  });

  it("adds and moves cluster coordinators (several may share a cluster; each holds at most one)", async () => {
    const owner = await staff("OWNER");
    const eventId = owner.eventId!;
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    const south = await clusters.createCluster(owner, clusterInput.parse({ name: "South" }));
    const cc1 = await createUser("CLUSTER_COORDINATOR", { eventId });
    const cc2 = await createUser("CLUSTER_COORDINATOR", { eventId });

    await clusters.addClusterCoordinator(owner, north.id, cc1.id);
    await clusters.addClusterCoordinator(owner, north.id, cc2.id);
    expect((await clusters.getCluster(owner, north.id)).coordinators.map((c) => c.id).sort()).toEqual([cc1.id, cc2.id].sort());

    await clusters.addClusterCoordinator(owner, south.id, cc1.id);
    expect((await clusters.getCluster(owner, north.id)).coordinators.map((c) => c.id)).not.toContain(cc1.id);
    expect((await clusters.getCluster(owner, south.id)).coordinators.map((c) => c.id)).toContain(cc1.id);
  });

  it("only assigns active cluster coordinators", async () => {
    const owner = await staff("OWNER");
    const { guestA } = await createTwoHotels();
    const cluster = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await expectError(clusters.addClusterCoordinator(owner, cluster.id, guestA.id), "invalid", "notActiveClusterCoordinator");
  });

  it("can't manage a cluster or hotel across events", async () => {
    const admin1 = await staff("ADMIN");
    const otherEventId = (await createEvent("Other event")).id;
    const admin2 = await staff("ADMIN", otherEventId);
    const { hotelA } = await createTwoHotels();
    const cluster = await clusters.createCluster(admin2, clusterInput.parse({ name: "Other event cluster" }));
    await expectError(clusters.addClusterHotel(admin2, cluster.id, hotelA.id), "not_found");
    await expectError(clusters.getCluster(admin1, cluster.id), "not_found");
  });
});

describe.skipIf(!hasTestDb)("cluster coordinator scope and visibility", () => {
  beforeEach(resetDb);

  it("sees every hotel in their cluster, and operates every active bus in it (but none outside it)", async () => {
    const owner = await staff("OWNER");
    const eventId = owner.eventId!;
    const { hotelA, hotelB, busA, busB, guestA } = await createTwoHotels(eventId);
    const cluster = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, cluster.id, hotelA.id);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, cluster.id, cc.id);

    const scope = await loadScope(cc);
    expect(scope.hotelIds.has(hotelA.id)).toBe(true);
    expect(scope.hotelIds.has(hotelB.id)).toBe(false);
    // Same operational reach as a hotel coordinator, but across the whole
    // cluster rather than one designated bus — they have none of their own.
    expect(scope.operableBusIds.has(busA.id)).toBe(true);
    expect(scope.operableBusIds.has(busB.id)).toBe(false);
    expect(canViewHotel(cc, scope, hotelA.id)).toBe(true);
    expect(canViewHotel(cc, scope, hotelB.id)).toBe(false);
    expect(canViewBus(cc, scope, busA)).toBe(true);
    expect(canViewBus(cc, scope, busB)).toBe(false);
    expect(canViewPerson(cc, scope, { id: guestA.id, role: "CUSTOMER", hotelId: hotelA.id })).toBe(true);
  });

  it("sees nothing when not yet assigned to a cluster", async () => {
    const owner = await staff("OWNER");
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId: owner.eventId! });
    const scope = await loadScope(cc);
    expect(scope.hotelIds.size).toBe(0);
  });
});
