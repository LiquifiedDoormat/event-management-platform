import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/generated/prisma/client";
import { isStaff, type Actor } from "@/server/policies";
import { forbidden } from "@/server/errors";
import { eventOf } from "./context";

// Reporting-hierarchy view (the "org chart"): Owner/Admin at the top, then
// each cluster's coordinator(s) with the hotels in that cluster, then each
// hotel's own coordinator(s). Built fresh per request from the same
// Cluster/Hotel/EventMember relationships every other page uses — there is
// no separate "manager" field to keep in sync.

export type OrgNode = {
  id: string;
  name: string;
  phone: string | null;
  /** "ROOT" is the chart's own invisible root; "HOTEL" is a hotel, not a person. */
  role: Role | "ROOT" | "HOTEL";
  children: OrgNode[];
};

type Person = { id: string; name: string; phone: string };

function leaf(p: Person, role: Role): OrgNode {
  return { id: p.id, name: p.name, phone: p.phone, role, children: [] };
}

function hotelNode(h: { id: string; name: string; members: { user: Person }[] }): OrgNode {
  return {
    id: h.id,
    name: h.name,
    phone: null,
    role: "HOTEL",
    children: h.members.map((m) => leaf(m.user, "COORDINATOR")),
  };
}

const hotelSelect = {
  id: true,
  name: true,
  members: { where: { user: { role: "COORDINATOR" as const, status: "ACTIVE" as const } }, select: { user: { select: { id: true, name: true, phone: true } } } },
};

/**
 * The hierarchy visible to `actor`, rooted at the highest post they may see:
 * - Owner/Admin: the whole event — every cluster (and unclustered hotels)
 *   down to each hotel's coordinators.
 * - Cluster coordinator: just their own cluster's branch.
 * - Hotel coordinator: just their own hotel, plus the cluster coordinator
 *   above it (if their hotel belongs to a cluster) — never a sibling hotel's
 *   coordinators, which they have no visibility into anywhere else either.
 */
export async function getOrgChart(actor: Actor): Promise<OrgNode> {
  const eventId = eventOf(actor);
  const root: OrgNode = { id: "root", name: "", phone: null, role: "ROOT", children: [] };

  if (isStaff(actor)) {
    const [admins, clusters, unclustered] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, role: true },
      }),
      prisma.cluster.findMany({
        where: { eventId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          members: { where: { user: { role: "CLUSTER_COORDINATOR", status: "ACTIVE" } }, select: { user: { select: { id: true, name: true, phone: true } } } },
          hotels: { where: { isActive: true }, orderBy: { name: "asc" }, select: hotelSelect },
        },
      }),
      prisma.hotel.findMany({ where: { eventId, isActive: true, clusterId: null }, orderBy: { name: "asc" }, select: hotelSelect }),
    ]);
    root.children = [
      ...admins.map((a) => leaf(a, a.role)),
      ...clusters.map((c) => ({
        id: c.id,
        name: c.name,
        phone: null,
        role: "CLUSTER_COORDINATOR" as const,
        children: [...c.members.map((m) => leaf(m.user, "CLUSTER_COORDINATOR")), ...c.hotels.map(hotelNode)],
      })),
      ...unclustered.map(hotelNode),
    ];
    return root;
  }

  if (actor.role === "CLUSTER_COORDINATOR") {
    const membership = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } }, select: { clusterId: true } });
    if (!membership?.clusterId) return root;
    const cluster = await prisma.cluster.findFirst({
      where: { id: membership.clusterId, eventId },
      select: { id: true, name: true, hotels: { where: { isActive: true }, orderBy: { name: "asc" }, select: hotelSelect } },
    });
    if (!cluster) return root;
    root.children = [{ id: cluster.id, name: cluster.name, phone: null, role: "CLUSTER_COORDINATOR", children: cluster.hotels.map(hotelNode) }];
    return root;
  }

  if (actor.role === "COORDINATOR") {
    const membership = await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } }, select: { hotelId: true } });
    if (!membership?.hotelId) return root;
    const hotel = await prisma.hotel.findFirst({
      where: { id: membership.hotelId, eventId },
      select: { id: true, name: true, clusterId: true, members: hotelSelect.members },
    });
    if (!hotel) return root;
    const node = hotelNode(hotel);
    if (!hotel.clusterId) {
      root.children = [node];
      return root;
    }
    const cluster = await prisma.cluster.findFirst({
      where: { id: hotel.clusterId, eventId },
      select: { id: true, name: true, members: { where: { user: { role: "CLUSTER_COORDINATOR", status: "ACTIVE" } }, select: { user: { select: { id: true, name: true, phone: true } } } } },
    });
    if (!cluster) {
      root.children = [node];
      return root;
    }
    root.children = [{ id: cluster.id, name: cluster.name, phone: null, role: "CLUSTER_COORDINATOR", children: [...cluster.members.map((m) => leaf(m.user, "CLUSTER_COORDINATOR")), node] }];
    return root;
  }

  throw forbidden();
}
