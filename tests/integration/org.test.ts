import { beforeEach, describe, expect, it } from "vitest";
import { clusterInput } from "@/lib/validation/entities";
import * as clusters from "@/server/services/clusters";
import { getOrgChart } from "@/server/services/org";
import { listPeople } from "@/server/services/people";
import { AppError } from "@/server/errors";
import { createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

const asActor = <T extends { eventId: string | null }>(u: T) => u;

describe.skipIf(!hasTestDb)("org chart", () => {
  beforeEach(resetDb);

  it("staff sees the whole hierarchy: cluster, its hotels, and each hotel's coordinator", async () => {
    const owner = await staff("OWNER");
    const { eventId, hotelA, coordA } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc.id);

    const root = await getOrgChart(owner);
    const clusterNode = root.children.find((c) => c.id === north.id);
    expect(clusterNode?.role).toBe("CLUSTER_COORDINATOR");
    expect(clusterNode?.children.some((c) => c.id === cc.id)).toBe(true);
    const hotelNode = clusterNode?.children.find((c) => c.id === hotelA.id);
    expect(hotelNode?.role).toBe("HOTEL");
    expect(hotelNode?.children.some((c) => c.id === coordA.id)).toBe(true);
  });

  it("a cluster coordinator sees only their own cluster's branch, not other clusters", async () => {
    const owner = await staff("OWNER");
    const { eventId, hotelA, hotelB } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    const south = await clusters.createCluster(owner, clusterInput.parse({ name: "South" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);
    await clusters.addClusterHotel(owner, south.id, hotelB.id);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc.id);

    const root = await getOrgChart(asActor({ ...cc, hotelId: null }));
    expect(root.children).toHaveLength(1);
    expect(root.children[0].id).toBe(north.id);
    expect(root.children[0].children.some((c) => c.id === hotelB.id)).toBe(false);
  });

  it("a hotel coordinator sees their own hotel and the cluster coordinator above it, not sibling hotels", async () => {
    const owner = await staff("OWNER");
    const { eventId, hotelA, hotelB, coordA } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);
    await clusters.addClusterHotel(owner, north.id, hotelB.id);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc.id);

    const root = await getOrgChart(asActor(coordA));
    expect(root.children).toHaveLength(1);
    const clusterNode = root.children[0];
    expect(clusterNode.id).toBe(north.id);
    expect(clusterNode.children.some((c) => c.id === cc.id)).toBe(true);
    expect(clusterNode.children.some((c) => c.id === hotelA.id)).toBe(true);
    expect(clusterNode.children.some((c) => c.id === hotelB.id)).toBe(false);
  });

  it("a customer has no org chart to see", async () => {
    const { guestA } = await createTwoHotels();
    const err = await getOrgChart(guestA).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("forbidden");
  });

  it("listPeople can filter to both coordinator roles at once", async () => {
    const owner = await staff("OWNER");
    const { eventId } = await createTwoHotels();
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    const page = await listPeople(owner, { role: ["COORDINATOR", "CLUSTER_COORDINATOR"] });
    const roles = new Set(page.items.map((p) => p.role));
    expect(roles.has("COORDINATOR")).toBe(true);
    expect(roles.has("CLUSTER_COORDINATOR")).toBe(true);
    expect(page.items.some((p) => p.id === cc.id)).toBe(true);
  });
});
