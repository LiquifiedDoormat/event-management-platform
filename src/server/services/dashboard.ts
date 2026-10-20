import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { can, type Actor } from "@/server/policies";
import { eventOf } from "./context";

/** Event-wide counts for Owner/Admin. Throws if the actor isn't staff. */
export async function getEventOverview(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw new Error("forbidden");
  const eventId = eventOf(actor);
  const member = (role: "CUSTOMER" | "COORDINATOR", extra = {}) =>
    prisma.eventMember.count({ where: { eventId, user: { role, status: "ACTIVE" }, ...extra } });
  const [hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel] =
    await Promise.all([
      prisma.hotel.count({ where: { eventId, isActive: true } }),
      prisma.bus.count({ where: { isActive: true, hotel: { eventId } } }),
      member("CUSTOMER"),
      member("COORDINATOR"),
      prisma.hotel.count({
        where: { eventId, isActive: true, members: { none: { user: { role: "COORDINATOR", status: "ACTIVE" } } } },
      }),
      member("CUSTOMER", { hotelId: null }),
    ]);
  return { hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel };
}

/** A cluster coordinator's cluster and its hotels, in the current event. View only. */
export async function getClusterCoordinatorOverview(user: SessionUser) {
  const eventId = eventOf(user);
  const membership = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    select: { cluster: { select: { id: true, name: true } } },
  });
  if (!membership?.cluster) return { cluster: null, hotels: [] };
  const hotels = await prisma.hotel.findMany({
    where: { eventId, clusterId: membership.cluster.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true },
  });
  return { cluster: membership.cluster, hotels };
}

/** A coordinator's assigned hotel and the buses they accompany, in the current event. */
export async function getCoordinatorOverview(user: SessionUser) {
  const eventId = eventOf(user);
  const [membership, buses] = await Promise.all([
    prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
      select: { hotel: { select: { name: true, address: true } } },
    }),
    prisma.bus.findMany({
      where: { coordinatorId: user.id, isActive: true, hotel: { eventId } },
      select: { id: true, label: true, hotel: { select: { name: true } } },
      orderBy: { label: "asc" },
    }),
  ]);
  return { hotel: membership?.hotel ?? null, buses };
}
