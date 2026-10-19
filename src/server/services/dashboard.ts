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
      prisma.hotel.count({ where: { eventId, isActive: true, coordinatorId: null } }),
      member("CUSTOMER", { hotelId: null }),
    ]);
  return { hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel };
}

/** A coordinator's designated hotel and the buses they accompany, in the current event. */
export async function getCoordinatorOverview(user: SessionUser) {
  const eventId = eventOf(user);
  const [hotel, buses] = await Promise.all([
    prisma.hotel.findFirst({ where: { coordinatorId: user.id, eventId }, select: { name: true, address: true } }),
    prisma.bus.findMany({
      where: { coordinatorId: user.id, isActive: true, hotel: { eventId } },
      select: { id: true, label: true, hotel: { select: { name: true } } },
      orderBy: { label: "asc" },
    }),
  ]);
  return { hotel, buses };
}
