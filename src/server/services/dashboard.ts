import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { can, type Actor } from "@/server/policies";

/** Event-wide counts for Owner/Admin. Throws if the actor isn't staff. */
export async function getEventOverview(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw new Error("forbidden");
  const [hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel] =
    await Promise.all([
      prisma.hotel.count({ where: { isActive: true } }),
      prisma.bus.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: "CUSTOMER", status: "ACTIVE" } }),
      prisma.user.count({ where: { role: "COORDINATOR", status: "ACTIVE" } }),
      prisma.hotel.count({ where: { isActive: true, coordinatorId: null } }),
      prisma.user.count({ where: { role: "CUSTOMER", status: "ACTIVE", hotelId: null } }),
    ]);
  return { hotels, buses, attendees, coordinators, hotelsWithoutCoordinator, attendeesWithoutHotel };
}

/**
 * A customer's own hotel, its coordinator (name + phone only) and its active buses.
 * Scoped by the user's current hotelId, read fresh from the session.
 */
export async function getCustomerOverview(user: SessionUser) {
  if (!user.hotelId) return null;
  return prisma.hotel.findFirst({
    where: { id: user.hotelId, isActive: true },
    select: {
      name: true,
      address: true,
      coordinator: { select: { name: true, phone: true } },
      buses: { where: { isActive: true }, select: { id: true, label: true }, orderBy: { label: "asc" } },
    },
  });
}

/** A coordinator's designated hotel and the buses they accompany. */
export async function getCoordinatorOverview(user: SessionUser) {
  const [hotel, buses] = await Promise.all([
    prisma.hotel.findUnique({ where: { coordinatorId: user.id }, select: { name: true, address: true } }),
    prisma.bus.findMany({
      where: { coordinatorId: user.id, isActive: true },
      select: { id: true, label: true, hotel: { select: { name: true } } },
      orderBy: { label: "asc" },
    }),
  ]);
  return { hotel, buses };
}
