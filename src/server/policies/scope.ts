import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Actor, Scope } from "./index";

const EMPTY: Scope = { hotelIds: new Set(), operableBusIds: new Set() };

/**
 * Loads the hotels and buses a non-staff user is related to *in their current
 * event*, fresh from the database on every request, so reassignments take
 * effect immediately. No event selected → nothing in scope.
 * Staff get an empty scope: policies grant them access by role instead.
 */
export async function loadScope(actor: Actor): Promise<Scope> {
  const eventId = actor.eventId;
  if (!eventId) return EMPTY;
  if (actor.role === "CUSTOMER") {
    // Session users carry their hotel for the current event; otherwise look it up.
    const hotelId =
      actor.hotelId !== undefined
        ? actor.hotelId
        : ((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } }, select: { hotelId: true } }))?.hotelId ?? null);
    return hotelId ? { hotelIds: new Set([hotelId]), operableBusIds: new Set() } : EMPTY;
  }
  if (actor.role !== "COORDINATOR") return EMPTY;

  const [hotel, buses, trips] = await Promise.all([
    prisma.hotel.findFirst({ where: { coordinatorId: actor.id, eventId }, select: { id: true } }),
    prisma.bus.findMany({ where: { coordinatorId: actor.id, isActive: true, hotel: { eventId } }, select: { id: true, hotelId: true } }),
    prisma.trip.findMany({
      where: { coordinatorId: actor.id, endedAt: null, bus: { hotel: { eventId } } },
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
