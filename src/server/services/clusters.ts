import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ClusterInput } from "@/lib/validation/entities";
import { can, type Actor } from "@/server/policies";
import { AppError, forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { OPTIONS_LIMIT, pageArgs, toPage } from "./pagination";
import { eventOf } from "./context";

// Clusters optionally group hotels within an event, for a cluster coordinator's
// read-only oversight. A hotel belongs to at most one cluster; a cluster
// coordinator is assigned to at most one cluster (same "move" pattern as
// hotel coordinators — see services/hotels.ts).

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

export async function listClusters(actor: Actor, opts: { q?: string; cursor?: string }) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  const rows = await prisma.cluster.findMany({
    where: { eventId, ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" as const } } : {}) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      name: true,
      _count: { select: { hotels: true, members: { where: { user: { role: "CLUSTER_COORDINATOR", status: "ACTIVE" } } } } },
    },
  });
  const page = toPage(rows);
  return { ...page, items: page.items.map(({ _count, ...c }) => ({ ...c, hotelCount: _count.hotels, coordinatorCount: _count.members })) };
}

export async function getCluster(actor: Actor, id: string) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  const cluster = await prisma.cluster.findFirst({
    where: { id, eventId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      hotels: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          members: {
            where: { user: { role: "COORDINATOR", status: "ACTIVE" } },
            select: { user: { select: { id: true, name: true, phone: true } } },
          },
          _count: { select: { buses: { where: { isActive: true } } } },
        },
      },
      members: {
        where: { user: { role: "CLUSTER_COORDINATOR" } },
        orderBy: { user: { name: "asc" } },
        select: { user: { select: { id: true, name: true, phone: true, status: true } } },
      },
    },
  });
  if (!cluster) throw notFound();
  const { hotels, members, ...rest } = cluster;
  return {
    ...rest,
    hotels: hotels.map(({ members: hotelMembers, _count, ...h }) => ({
      ...h,
      coordinators: hotelMembers.map((m) => m.user),
      busCount: _count.buses,
    })),
    coordinators: members.map((m) => m.user),
  };
}

export async function createCluster(actor: Actor, input: ClusterInput) {
  requireCan(actor, "cluster.create");
  return prisma.$transaction(async (tx) => {
    const cluster = await tx.cluster.create({ data: { ...input, eventId: eventOf(actor) }, select: { id: true } });
    await audit(tx, actor, "cluster.create", "Cluster", cluster.id, { name: input.name });
    return cluster;
  });
}

export async function updateCluster(actor: Actor, id: string, input: ClusterInput) {
  requireCan(actor, "cluster.update");
  return prisma.$transaction(async (tx) => {
    const before = await tx.cluster.findFirst({ where: { id, eventId: eventOf(actor) }, select: { id: true } });
    if (!before) throw notFound();
    await tx.cluster.update({ where: { id }, data: input });
    await audit(tx, actor, "cluster.update", "Cluster", id, { fields: Object.keys(input) });
  });
}

/** Adds a hotel to a cluster. A hotel belongs to at most one cluster, so this moves it. */
export async function addClusterHotel(actor: Actor, clusterId: string, hotelId: string) {
  requireCan(actor, "cluster.manageHotels");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const cluster = await tx.cluster.findFirst({ where: { id: clusterId, eventId }, select: { id: true } });
    if (!cluster) throw notFound();
    const hotel = await tx.hotel.findFirst({ where: { id: hotelId, eventId }, select: { clusterId: true } });
    if (!hotel) throw notFound();
    if (hotel.clusterId === clusterId) return;
    await tx.hotel.update({ where: { id: hotelId }, data: { clusterId } });
    await audit(tx, actor, "cluster.addHotel", "Cluster", clusterId, { hotelId, movedFrom: hotel.clusterId });
  });
}

/** Removes a hotel from its cluster (ungroups it; the hotel itself is untouched). */
export async function removeClusterHotel(actor: Actor, clusterId: string, hotelId: string) {
  requireCan(actor, "cluster.manageHotels");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.findFirst({ where: { id: hotelId, eventId, clusterId }, select: { id: true } });
    if (!hotel) throw notFound();
    await tx.hotel.update({ where: { id: hotelId }, data: { clusterId: null } });
    await audit(tx, actor, "cluster.removeHotel", "Cluster", clusterId, { hotelId });
  });
}

/**
 * Adds an active cluster coordinator to a cluster. Several cluster coordinators
 * may share a cluster, but each is assigned to at most one, so this moves them
 * off whatever cluster they held before (same pattern as hotel coordinators).
 */
export async function addClusterCoordinator(actor: Actor, clusterId: string, coordinatorId: string) {
  requireCan(actor, "cluster.manageCoordinators");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const cluster = await tx.cluster.findFirst({ where: { id: clusterId, eventId }, select: { id: true } });
    if (!cluster) throw notFound();
    const coordinator = await tx.user.findFirst({
      where: { id: coordinatorId, role: "CLUSTER_COORDINATOR", status: "ACTIVE" },
      select: { id: true },
    });
    if (!coordinator) throw new AppError("invalid", "notActiveClusterCoordinator");
    const membership = await tx.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId: coordinatorId } },
      select: { id: true, clusterId: true },
    });
    if (!membership) throw new AppError("invalid", "notActiveClusterCoordinator");
    if (membership.clusterId === clusterId) return;
    await tx.eventMember.update({ where: { id: membership.id }, data: { clusterId } });
    await audit(tx, actor, "cluster.addCoordinator", "Cluster", clusterId, { coordinatorId, movedFrom: membership.clusterId });
  });
}

/** Removes a cluster coordinator from a cluster's roster. Their account is untouched. */
export async function removeClusterCoordinator(actor: Actor, clusterId: string, coordinatorId: string) {
  requireCan(actor, "cluster.manageCoordinators");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.eventMember.findFirst({ where: { eventId, userId: coordinatorId, clusterId }, select: { id: true } });
    if (!membership) throw notFound();
    await tx.eventMember.update({ where: { id: membership.id }, data: { clusterId: null } });
    await audit(tx, actor, "cluster.removeCoordinator", "Cluster", clusterId, { coordinatorId });
  });
}

/** Clusters for dropdowns. */
export async function clusterOptions(actor: Actor) {
  requireCan(actor, "dashboard.viewAll");
  return prisma.cluster.findMany({
    where: { eventId: eventOf(actor) },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true },
  });
}
