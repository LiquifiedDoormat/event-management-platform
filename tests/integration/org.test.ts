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

  it("staff sees Admin -> Cluster Coordinator -> Hotels -> Coordinators, in that nesting", async () => {
    const owner = await staff("OWNER");
    const { eventId, hotelA, coordA } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc.id);

    const root = await getOrgChart(owner);
    // The cluster coordinator PERSON is the node directly under the root
    // (Admin level) — not a stand-in node for the cluster itself.
    const ccNode = root.children.find((c) => c.id === cc.id);
    expect(ccNode?.role).toBe("CLUSTER_COORDINATOR");
    expect(root.children.some((c) => c.id === north.id)).toBe(false);
    const hotelNode = ccNode?.children.find((c) => c.id === hotelA.id);
    expect(hotelNode?.role).toBe("HOTEL");
    expect(hotelNode?.children.some((c) => c.id === coordA.id)).toBe(true);
  });

  it("a cluster with two coordinators shows the same hotels nested under each one", async () => {
    const owner = await staff("OWNER");
    const { eventId, hotelA } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);
    const cc1 = await createUser("CLUSTER_COORDINATOR", { eventId });
    const cc2 = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc1.id);
    await clusters.addClusterCoordinator(owner, north.id, cc2.id);

    const root = await getOrgChart(owner);
    for (const cc of [cc1, cc2]) {
      const ccNode = root.children.find((c) => c.id === cc.id);
      expect(ccNode?.children.some((h) => h.id === hotelA.id)).toBe(true);
    }
  });

  it("a cluster with no coordinator still shows its hotels, directly under Admin", async () => {
    const owner = await staff("OWNER");
    const { hotelA } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    await clusters.addClusterHotel(owner, north.id, hotelA.id);

    const root = await getOrgChart(owner);
    expect(root.children.some((c) => c.id === hotelA.id && c.role === "HOTEL")).toBe(true);
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
    // The top node is the coordinator themselves, not the cluster.
    expect(root.children[0].id).toBe(cc.id);
    expect(root.children[0].role).toBe("CLUSTER_COORDINATOR");
    expect(root.children[0].children.some((c) => c.id === hotelA.id)).toBe(true);
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
    // The top node is the cluster coordinator above their hotel, not the cluster.
    const ccNode = root.children[0];
    expect(ccNode.id).toBe(cc.id);
    expect(ccNode.role).toBe("CLUSTER_COORDINATOR");
    expect(ccNode.children.some((c) => c.id === hotelA.id)).toBe(true);
    expect(ccNode.children.some((c) => c.id === hotelB.id)).toBe(false);
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
