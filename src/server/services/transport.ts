import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";
import { canViewBus, isStaff, type Actor } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { notFound } from "@/server/errors";
import { eventOf } from "./context";
import type { BusLiveSnapshot } from "@/lib/realtime/types";
import type { BusStatus } from "@/generated/prisma/enums";

const DEFAULT_CONFIG = { staleLocationSeconds: 120, historySampleSeconds: 30 };

/** Platform-wide tracking settings (single row; falls back to defaults if not created yet). */
export async function getEventSettings() {
  const config = await prisma.eventConfig.findUnique({
    where: { id: 1 },
    select: { staleLocationSeconds: true, historySampleSeconds: true },
  });
  return config ?? DEFAULT_CONFIG;
}

/**
 * An attendee's homepage data: their own hotel (read from their current
 * allotment), its active coordinators' names and phones, and its active buses
 * with the latest status and location timestamp. Never includes other hotels.
 */
export async function getCustomerHome(user: SessionUser) {
  const [settings, hotel] = await Promise.all([
    getEventSettings(),
    user.hotelId
      ? prisma.hotel.findFirst({
          where: { id: user.hotelId, isActive: true, eventId: eventOf(user) },
          select: {
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            members: {
              where: { user: { role: "COORDINATOR", status: "ACTIVE" } },
              orderBy: { user: { name: "asc" } },
              select: { user: { select: { name: true, phone: true } } },
            },
            buses: {
              where: { isActive: true },
              orderBy: { label: "asc" },
              select: {
                id: true,
                label: true,
                _count: { select: { stops: true } },
                trips: { where: { endedAt: null }, take: 1, select: { status: true, statusChangedAt: true, sharingLocation: true, isDelayed: true } },
                location: { select: { latitude: true, longitude: true, accuracy: true, recordedAt: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);
  const shaped = hotel ? (({ members, ...rest }) => ({ ...rest, coordinators: members.map((m) => m.user) }))(hotel) : null;
  return { settings, hotel: shaped };
}

/**
 * One bus as attendees see it: status, latest position, ordered stops and the
 * coordinator on board. Visible to staff, to attendees of the bus's hotel and to
 * coordinators with that hotel in scope. Anything else is reported as not found.
 */
export async function getTrackedBus(actor: Actor, busId: string) {
  const bus = await prisma.bus.findFirst({
    where: { id: busId, hotel: { eventId: eventOf(actor) } },
    select: {
      id: true,
      label: true,
      registration: true,
      isActive: true,
      hotelId: true,
      hotel: { select: { name: true, address: true, latitude: true, longitude: true } },
      stops: {
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, name: true, address: true, latitude: true, longitude: true, timeNote: true },
      },
      trips: {
        where: { endedAt: null },
        take: 1,
        select: {
          status: true,
          statusChangedAt: true,
          sharingLocation: true,
          isDelayed: true,
          // Contact for the person accompanying this bus (operational purpose).
          coordinator: { select: { name: true, phone: true } },
        },
      },
      location: { select: { latitude: true, longitude: true, accuracy: true, recordedAt: true } },
    },
  });
  if (!bus || (!bus.isActive && !isStaff(actor))) throw notFound();
  const scope = await loadScope(actor);
  if (!canViewBus(actor, scope, bus)) throw notFound();
  const settings = await getEventSettings();
  return { bus, settings };
}

type TripRow = { status: BusStatus; statusChangedAt: Date; sharingLocation: boolean; isDelayed: boolean };
type LocationRow = { latitude: number; longitude: number; accuracy: number | null; recordedAt: Date };

/** Builds the browser snapshot from rows already loaded for a page. */
export function toSnapshot(busId: string, trip: TripRow | undefined, location: LocationRow | null | undefined): BusLiveSnapshot {
  return {
    busId,
    trip: trip
      ? { status: trip.status, statusChangedAt: trip.statusChangedAt.toISOString(), sharingLocation: trip.sharingLocation, isDelayed: trip.isDelayed }
      : null,
    location: location ? { ...location, recordedAt: location.recordedAt.toISOString() } : null,
  };
}

/** Current live state of a bus (active trip + latest position), as sent to browsers. */
export async function getBusSnapshot(busId: string): Promise<BusLiveSnapshot> {
  const bus = await prisma.bus.findUnique({
    where: { id: busId },
    select: {
      trips: { where: { endedAt: null }, take: 1, select: { status: true, statusChangedAt: true, sharingLocation: true, isDelayed: true } },
      location: { select: { latitude: true, longitude: true, accuracy: true, recordedAt: true } },
    },
  });
  return toSnapshot(busId, bus?.trips[0], bus?.location);
}

/** Throws not_found unless `actor` may view this bus (same rule as the tracking page). */
export async function assertCanViewBus(actor: Actor, busId: string) {
  // Only buses of the actor's current event exist from their point of view.
  const bus = await prisma.bus.findFirst({ where: { id: busId, hotel: { eventId: eventOf(actor) } }, select: { hotelId: true, isActive: true } });
  if (!bus || (!bus.isActive && !isStaff(actor))) throw notFound();
  if (!canViewBus(actor, await loadScope(actor), bus)) throw notFound();
}

/** Snapshot for an authorized viewer (polling fallback). */
export async function getLiveBus(actor: Actor, busId: string) {
  await assertCanViewBus(actor, busId);
  return getBusSnapshot(busId);
}
