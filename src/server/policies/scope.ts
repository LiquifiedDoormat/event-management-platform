import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Actor, Scope } from "./index";

const EMPTY: Scope = { hotelIds: new Set(), operableBusIds: new Set() };

/**
 * Loads the hotels and buses a non-staff user is related to, fresh from the
 * database on every request, so reassignments take effect immediately.
 * Staff get an empty scope: policies grant them access by role instead.
 */
export async function loadScope(actor: Actor): Promise<Scope> {
  if (actor.role === "CUSTOMER") {
    return actor.hotelId ? { hotelIds: new Set([actor.hotelId]), operableBusIds: new Set() } : EMPTY;
  }
  if (actor.role !== "COORDINATOR") return EMPTY;

  const [hotel, buses, trips] = await Promise.all([
    prisma.hotel.findUnique({ where: { coordinatorId: actor.id }, select: { id: true } }),
    prisma.bus.findMany({ where: { coordinatorId: actor.id, isActive: true }, select: { id: true, hotelId: true } }),
    prisma.trip.findMany({
      where: { coordinatorId: actor.id, endedAt: null },
      select: { busId: true, bus: { select: { hotelId: true } } },
    }),
  ]);

  const hotelIds = new Set<string>();
  const operableBusIds = new Set<string>();
  if (hotel) hotelIds.add(hotel.id);
  for (const b of buses) {
    hotelIds.add(b.hotelId);
    operableBusIds.add(b.id);
  }
  for (const t of trips) {
    hotelIds.add(t.bus.hotelId);
    operableBusIds.add(t.busId);
  }
  return { hotelIds, operableBusIds };
}
