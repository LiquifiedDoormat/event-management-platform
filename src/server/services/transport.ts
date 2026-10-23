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
  const [settings, hotel, membership] = await Promise.all([
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
    prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId: eventOf(user), userId: user.id } },
      select: { zone: { select: { id: true, name: true, gates: { orderBy: { name: "asc" }, select: { id: true, name: true } } } } },
    }),
  ]);
  const shaped = hotel ? (({ members, ...rest }) => ({ ...rest, coordinators: members.map((m) => m.user) }))(hotel) : null;
  return { settings, hotel: shaped, zone: membership?.zone ?? null };
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

type LiveBusRow = { hotelId: string; isActive: boolean; trips: TripRow[]; location: LocationRow | null };

/**
 * Short-lived, per-process cache for the polling endpoint. Many attendees of the
 * same bus poll independently every 20-60s; with ~100+ viewers sharing a bus this
 * collapses near-simultaneous polls into one query instead of one-per-viewer.
 * Caches the in-flight promise (not just the resolved value) so concurrent callers
 * within the window share a single query. Keyed by event too, since a bus id is
 * only unique within its own event's data set from the actor's point of view.
 * 3s is well under the 20s "active trip" poll interval, so no viewer perceives
 * staler data than before — `location.recordedAt` is the real DB timestamp, so
 * freshness labels in the UI stay accurate regardless of cache age.
 */
const SNAPSHOT_CACHE_TTL_MS = 3_000;
const liveBusCache = new Map<string, { expires: number; promise: Promise<LiveBusRow | null> }>();

function loadLiveBusRow(eventId: string, busId: string): Promise<LiveBusRow | null> {
  const key = `${eventId}:${busId}`;
  const now = Date.now();
  const hit = liveBusCache.get(key);
  if (hit && hit.expires > now) return hit.promise;
  const promise = prisma.bus.findFirst({
    where: { id: busId, hotel: { eventId } },
    select: {
      hotelId: true,
      isActive: true,
      trips: { where: { endedAt: null }, take: 1, select: { status: true, statusChangedAt: true, sharingLocation: true, isDelayed: true } },
      location: { select: { latitude: true, longitude: true, accuracy: true, recordedAt: true } },
    },
  });
  liveBusCache.set(key, { expires: now + SNAPSHOT_CACHE_TTL_MS, promise });
  // A failed query must not be served to the next caller for the rest of the window.
  promise.catch(() => liveBusCache.delete(key));
  return promise;
}

/**
 * Snapshot for an authorized viewer (polling fallback). Combines the permission
 * check and the data fetch into one (cached) query instead of two separate ones.
 */
export async function getLiveBus(actor: Actor, busId: string) {
  const bus = await loadLiveBusRow(eventOf(actor), busId);
  if (!bus || (!bus.isActive && !isStaff(actor))) throw notFound();
  if (!canViewBus(actor, await loadScope(actor), bus)) throw notFound();
  return toSnapshot(busId, bus.trips[0], bus.location);
}
