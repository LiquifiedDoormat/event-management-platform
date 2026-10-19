import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { BusStatus } from "@/generated/prisma/enums";
import { rateLimit } from "@/lib/rate-limit";
import { can, canChangeStatus, canSendLocation, canStartTrip, type Actor } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { audit } from "./audit";
import { getEventSettings } from "./transport";
import { eventOf } from "./context";

// Trip lifecycle and live data. A trip is one run of a bus with a coordinator
// on board; at most one active trip per bus (DB partial unique index) and per
// coordinator (checked here). Viewers pick up changes by polling /api/buses/[id]/live.

/** A trip of the actor's current event (trips of other events are "not found"). */
async function findTrip(actor: Actor, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, bus: { hotel: { eventId: eventOf(actor) } } },
    select: { id: true, busId: true, coordinatorId: true, endedAt: true, status: true, statusVersion: true, sharingLocation: true },
  });
  if (!trip) throw notFound();
  return trip;
}

/**
 * Coordinators start trips on buses they are designated to (they ride along).
 * Staff can start a trip for the bus's designated coordinator.
 */
export async function startTrip(actor: Actor, busId: string) {
  if (!canStartTrip(actor, await loadScope(actor), busId)) throw forbidden();
  let tripId: string;
  try {
    tripId = await prisma.$transaction(async (tx) => {
      const bus = await tx.bus.findFirst({ where: { id: busId, hotel: { eventId: eventOf(actor) } }, select: { isActive: true, coordinatorId: true } });
      if (!bus) throw notFound();
      if (!bus.isActive) throw new AppError("invalid", "busInactive");
      // Checked explicitly for a clear message; the partial unique index still guards races.
      if (await tx.trip.count({ where: { busId, endedAt: null } })) throw conflict("busOnTrip");
      const coordinatorId = actor.role === "COORDINATOR" ? actor.id : bus.coordinatorId;
      if (!coordinatorId) throw new AppError("invalid", "busHasNoCoordinator");
      const coordinatorOk = await tx.user.count({
        where: { id: coordinatorId, role: "COORDINATOR", status: "ACTIVE", memberships: { some: { eventId: eventOf(actor) } } },
      });
      if (!coordinatorOk) throw new AppError("invalid", "notActiveCoordinator");
      if (await tx.trip.count({ where: { coordinatorId, endedAt: null } })) throw conflict("coordinatorOnTrip");

      // A position left over from an earlier trip must never show as this trip's.
      await tx.busLocation.deleteMany({ where: { busId } });
      const trip = await tx.trip.create({ data: { busId, coordinatorId, status: "BOARDING" }, select: { id: true } });
      await tx.busStatusEvent.create({ data: { tripId: trip.id, busId, status: "BOARDING", changedById: actor.id } });
      await audit(tx, actor, "trip.start", "Trip", trip.id, { busId, coordinatorId });
      return trip.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("busOnTrip");
    throw err;
  }
  return { id: tripId };
}

/** Ends a trip: stops tracking and removes the live position (history points remain). */
export async function endTrip(actor: Actor, tripId: string) {
  const trip = await findTrip(actor, tripId);
  const allowed = can(actor, "trip.manage") || (actor.role === "COORDINATOR" && trip.coordinatorId === actor.id);
  if (!allowed) throw forbidden();
  if (trip.endedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.trip.update({ where: { id: tripId }, data: { endedAt: new Date(), sharingLocation: false } });
    await tx.busLocation.deleteMany({ where: { tripId } });
    await audit(tx, actor, "trip.end", "Trip", tripId, { busId: trip.busId });
  });
}

/**
 * Sets the bus status. `expectedVersion` is the version the user saw; if the
 * status changed since (another device, a double tap), the update is rejected
 * instead of silently overwriting newer information.
 */
export async function changeStatus(actor: Actor, tripId: string, status: BusStatus, expectedVersion: number) {
  const trip = await findTrip(actor, tripId);
  if (trip.endedAt) throw conflict("tripEnded");
  if (!canChangeStatus(actor, trip)) throw forbidden();
  if (trip.statusVersion !== expectedVersion) throw conflict("staleStatus");
  if (trip.status === status) return { version: trip.statusVersion };

  const version = await prisma.$transaction(async (tx) => {
    const updated = await tx.trip.updateMany({
      where: { id: tripId, statusVersion: expectedVersion, endedAt: null },
      data: { status, statusChangedAt: new Date(), statusVersion: { increment: 1 } },
    });
    if (updated.count === 0) throw conflict("staleStatus");
    await tx.busStatusEvent.create({ data: { tripId, busId: trip.busId, status, changedById: actor.id } });
    if (actor.id !== trip.coordinatorId) {
      await audit(tx, actor, "trip.correctStatus", "Trip", tripId, { from: trip.status, to: status });
    }
    return expectedVersion + 1;
  });
  return { version };
}

/** Coordinator turns location sharing on or off for their own active trip. */
export async function setSharing(actor: Actor, tripId: string, sharing: boolean) {
  const trip = await findTrip(actor, tripId);
  if (trip.endedAt) throw conflict("tripEnded");
  if (!canSendLocation(actor, trip)) throw forbidden();
  if (trip.sharingLocation === sharing) return;
  await prisma.trip.update({ where: { id: tripId }, data: { sharingLocation: sharing } });
}

export type LocationInput = {
  tripId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** Device timestamp (ms since epoch) from the Geolocation API. */
  recordedAt: number;
};

export type LocationResult = { accepted: true } | { accepted: false; reason: "outOfOrder" | "tooOld" | "rateLimited" };

const MAX_FUTURE_MS = 2 * 60 * 1000;
const MAX_AGE_MS = 30 * 60 * 1000;
/** Generous cap: a phone sends ~every 5–10 s; this only stops runaway clients. */
const LOCATION_LIMIT = { limit: 30, windowSeconds: 60 };

/**
 * Accepts a GPS reading from the coordinator on the trip. Only newer readings
 * replace the stored position (one conditional upsert), so delayed or
 * duplicate requests can never move the bus backwards in time.
 */
export async function recordLocation(actor: Actor, input: LocationInput): Promise<LocationResult> {
  const trip = await findTrip(actor, input.tripId);
  if (trip.endedAt) throw conflict("tripEnded");
  if (!canSendLocation(actor, trip)) throw forbidden();

  const now = Date.now();
  if (input.recordedAt > now + MAX_FUTURE_MS) throw new AppError("invalid", "clockAhead");
  if (input.recordedAt < now - MAX_AGE_MS) return { accepted: false, reason: "tooOld" };

  const limit = await rateLimit(`location:${trip.id}`, LOCATION_LIMIT.limit, LOCATION_LIMIT.windowSeconds);
  if (!limit.allowed) return { accepted: false, reason: "rateLimited" };

  const recordedAt = new Date(input.recordedAt);
  const rows = await prisma.$queryRaw<{ busId: string }[]>`
    INSERT INTO "BusLocation" ("busId", "tripId", "latitude", "longitude", "accuracy", "recordedAt", "receivedAt")
    VALUES (${trip.busId}, ${trip.id}, ${input.latitude}, ${input.longitude}, ${input.accuracy}, ${recordedAt}, now())
    ON CONFLICT ("busId") DO UPDATE SET
      "tripId" = EXCLUDED."tripId", "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude",
      "accuracy" = EXCLUDED."accuracy", "recordedAt" = EXCLUDED."recordedAt", "receivedAt" = now()
    WHERE "BusLocation"."recordedAt" < EXCLUDED."recordedAt" OR "BusLocation"."tripId" <> EXCLUDED."tripId"
    RETURNING "busId"`;
  if (rows.length === 0) return { accepted: false, reason: "outOfOrder" };

  // Sampled history (not every reading) for after-the-fact review; pruned by retention.
  const { historySampleSeconds } = await getEventSettings();
  const last = await prisma.locationPoint.findFirst({
    where: { tripId: trip.id },
    orderBy: { recordedAt: "desc" },
    select: { recordedAt: true },
  });
  const writes: Promise<unknown>[] = [];
  if (!last || recordedAt.getTime() - last.recordedAt.getTime() >= historySampleSeconds * 1000) {
    writes.push(
      prisma.locationPoint.create({
        data: { tripId: trip.id, latitude: input.latitude, longitude: input.longitude, accuracy: input.accuracy, recordedAt },
      }),
    );
  }
  if (!trip.sharingLocation) writes.push(prisma.trip.update({ where: { id: trip.id }, data: { sharingLocation: true } }));
  await Promise.all(writes);
  return { accepted: true };
}

/** A coordinator's active trips in their current event (normally zero or one). */
export function activeTripsFor(actor: Actor) {
  return prisma.trip.findMany({
    where: { coordinatorId: actor.id, endedAt: null, bus: { hotel: { eventId: eventOf(actor) } } },
    select: { id: true, busId: true, status: true, statusVersion: true, statusChangedAt: true, sharingLocation: true, bus: { select: { label: true, hotel: { select: { name: true } } } } },
  });
}
