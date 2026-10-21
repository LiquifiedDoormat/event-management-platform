import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BusInput, StopInput } from "@/lib/validation/entities";
import { can, type Actor } from "@/server/policies";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { audit } from "./audit";
import { pageArgs, toPage } from "./pagination";
import { eventOf } from "./context";

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

async function requireActiveHotel(tx: Prisma.TransactionClient, hotelId: string, eventId: string) {
  const hotel = await tx.hotel.findFirst({ where: { id: hotelId, eventId }, select: { isActive: true } });
  if (!hotel?.isActive) throw new AppError("invalid", "hotelInactive");
}

async function requireActiveCoordinator(tx: Prisma.TransactionClient, userId: string, eventId: string) {
  const ok = await tx.user.count({ where: { id: userId, role: "COORDINATOR", status: "ACTIVE", memberships: { some: { eventId } } } });
  if (!ok) throw new AppError("invalid", "notActiveCoordinator");
}

/** Translates a duplicate-registration error into a friendly conflict. */
async function withUniqueRegistration<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("duplicateRegistration");
    throw err;
  }
}

export async function listBuses(
  actor: Actor,
  opts: { q?: string; cursor?: string; hotelId?: string; includeInactive?: boolean },
) {
  requireCan(actor, "dashboard.viewAll");
  const where: Prisma.BusWhereInput = {
    hotel: { eventId: eventOf(actor) },
    ...(opts.includeInactive ? {} : { isActive: true }),
    ...(opts.hotelId ? { hotelId: opts.hotelId } : {}),
    ...(opts.q
      ? {
          OR: [
            { label: { contains: opts.q, mode: "insensitive" } },
            { registration: { contains: opts.q.replace(/\s+/g, ""), mode: "insensitive" } },
            { id: opts.q },
          ],
        }
      : {}),
  };
  const rows = await prisma.bus.findMany({
    where,
    orderBy: [{ label: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      label: true,
      registration: true,
      isActive: true,
      hotel: { select: { id: true, name: true } },
      coordinator: { select: { id: true, name: true } },
      trips: { where: { endedAt: null }, take: 1, select: { status: true, statusChangedAt: true } },
    },
  });
  return toPage(rows);
}

export async function getBus(actor: Actor, id: string) {
  requireCan(actor, "dashboard.viewAll");
  const bus = await prisma.bus.findFirst({
    where: { id, hotel: { eventId: eventOf(actor) } },
    select: {
      id: true,
      label: true,
      registration: true,
      routeNotes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      hotel: { select: { id: true, name: true } },
      coordinator: { select: { id: true, name: true, phone: true } },
      stops: {
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, name: true, address: true, latitude: true, longitude: true, timeNote: true },
      },
      trips: {
        where: { endedAt: null },
        take: 1,
        select: { id: true, status: true, statusVersion: true, statusChangedAt: true, coordinator: { select: { id: true, name: true } } },
      },
      location: { select: { latitude: true, longitude: true, recordedAt: true } },
    },
  });
  if (!bus) throw notFound();
  return bus;
}

export async function createBus(actor: Actor, input: BusInput & { hotelId: string }) {
  requireCan(actor, "bus.create");
  return withUniqueRegistration(() =>
    prisma.$transaction(async (tx) => {
      await requireActiveHotel(tx, input.hotelId, eventOf(actor));
      const bus = await tx.bus.create({ data: input, select: { id: true } });
      await audit(tx, actor, "bus.create", "Bus", bus.id, { label: input.label, hotelId: input.hotelId });
      return bus;
    }),
  );
}

export async function updateBus(actor: Actor, id: string, input: BusInput) {
  requireCan(actor, "bus.update");
  return withUniqueRegistration(() =>
    prisma.$transaction(async (tx) => {
      if (!(await tx.bus.findFirst({ where: { id, hotel: { eventId: eventOf(actor) } }, select: { id: true } }))) throw notFound();
      await tx.bus.update({
        where: { id },
        data: { label: input.label, registration: input.registration ?? null, routeNotes: input.routeNotes ?? null },
      });
      await audit(tx, actor, "bus.update", "Bus", id, { fields: Object.keys(input) });
    }),
  );
}

/** Owner only. A bus on an active trip can't be deactivated. */
export async function setBusActive(actor: Actor, id: string, isActive: boolean) {
  requireCan(actor, "bus.deactivate");
  return prisma.$transaction(async (tx) => {
    const bus = await tx.bus.findFirst({
      where: { id, hotel: { eventId: eventOf(actor) } },
      select: { trips: { where: { endedAt: null }, select: { id: true } } },
    });
    if (!bus) throw notFound();
    if (!isActive && bus.trips.length > 0) throw conflict("busOnTrip");
    await tx.bus.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? "bus.activate" : "bus.deactivate", "Bus", id);
  });
}

/** Owner only. */
export async function reassignBusHotel(actor: Actor, id: string, hotelId: string) {
  requireCan(actor, "bus.reassignHotel");
  return prisma.$transaction(async (tx) => {
    const bus = await tx.bus.findFirst({ where: { id, hotel: { eventId: eventOf(actor) } }, select: { hotelId: true } });
    if (!bus) throw notFound();
    await requireActiveHotel(tx, hotelId, eventOf(actor));
    await tx.bus.update({ where: { id }, data: { hotelId } });
    await audit(tx, actor, "bus.reassignHotel", "Bus", id, { from: bus.hotelId, to: hotelId });
  });
}

/**
 * Owner only. Sets (or clears) the bus's one responsible coordinator. A
 * coordinator is responsible for at most one bus (DB-unique), so assigning
 * them here moves them off whatever bus they held before.
 */
export async function assignBusCoordinator(actor: Actor, id: string, coordinatorId: string | null) {
  requireCan(actor, "bus.assignCoordinator");
  return prisma.$transaction(async (tx) => {
    const bus = await tx.bus.findFirst({ where: { id, hotel: { eventId: eventOf(actor) } }, select: { coordinatorId: true } });
    if (!bus) throw notFound();
    let movedFrom: string | null = null;
    if (coordinatorId) {
      await requireActiveCoordinator(tx, coordinatorId, eventOf(actor));
      const previousBus = await tx.bus.findUnique({ where: { coordinatorId }, select: { id: true } });
      if (previousBus && previousBus.id !== id) {
        await tx.bus.update({ where: { id: previousBus.id }, data: { coordinatorId: null } });
        movedFrom = previousBus.id;
      }
    }
    await tx.bus.update({ where: { id }, data: { coordinatorId } });
    await audit(tx, actor, "bus.assignCoordinator", "Bus", id, {
      from: bus.coordinatorId,
      to: coordinatorId,
      ...(movedFrom ? { removedFromBus: movedFrom } : {}),
    });
  });
}

// ---------------------------------------------------------------------------
// Stops. Sequence numbers are kept contiguous (1..n).
// ---------------------------------------------------------------------------

/** Rewrites sequences to match `orderedIds`, avoiding unique (busId, sequence) clashes. */
async function resequence(tx: Prisma.TransactionClient, busId: string, orderedIds: string[]) {
  await tx.busStop.updateMany({ where: { busId }, data: { sequence: { increment: 10_000 } } });
  for (const [i, id] of orderedIds.entries()) {
    await tx.busStop.update({ where: { id }, data: { sequence: i + 1 } });
  }
}

async function stopsOf(tx: Prisma.TransactionClient, busId: string) {
  return tx.busStop.findMany({ where: { busId }, orderBy: { sequence: "asc" }, select: { id: true } });
}

export async function addStop(actor: Actor, busId: string, input: StopInput) {
  requireCan(actor, "bus.editStops");
  return prisma.$transaction(async (tx) => {
    if (!(await tx.bus.findFirst({ where: { id: busId, hotel: { eventId: eventOf(actor) } }, select: { id: true } }))) throw notFound();
    const last = await tx.busStop.findFirst({ where: { busId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const stop = await tx.busStop.create({ data: { ...input, busId, sequence: (last?.sequence ?? 0) + 1 } });
    await audit(tx, actor, "bus.addStop", "Bus", busId, { stopId: stop.id, name: input.name });
  });
}

export async function updateStop(actor: Actor, stopId: string, input: StopInput) {
  requireCan(actor, "bus.editStops");
  return prisma.$transaction(async (tx) => {
    const stop = await tx.busStop.findFirst({ where: { id: stopId, bus: { hotel: { eventId: eventOf(actor) } } }, select: { busId: true } });
    if (!stop) throw notFound();
    await tx.busStop.update({
      where: { id: stopId },
      data: {
        name: input.name,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        timeNote: input.timeNote ?? null,
      },
    });
    await audit(tx, actor, "bus.updateStop", "Bus", stop.busId, { stopId });
  });
}

export async function removeStop(actor: Actor, stopId: string) {
  requireCan(actor, "bus.editStops");
  return prisma.$transaction(async (tx) => {
    const stop = await tx.busStop.findFirst({ where: { id: stopId, bus: { hotel: { eventId: eventOf(actor) } } }, select: { busId: true, name: true } });
    if (!stop) throw notFound();
    await tx.busStop.delete({ where: { id: stopId } });
    await resequence(tx, stop.busId, (await stopsOf(tx, stop.busId)).map((s) => s.id));
    await audit(tx, actor, "bus.removeStop", "Bus", stop.busId, { stopId, name: stop.name });
  });
}

export async function moveStop(actor: Actor, stopId: string, direction: "up" | "down") {
  requireCan(actor, "bus.editStops");
  return prisma.$transaction(async (tx) => {
    const stop = await tx.busStop.findFirst({ where: { id: stopId, bus: { hotel: { eventId: eventOf(actor) } } }, select: { busId: true } });
    if (!stop) throw notFound();
    const ids = (await stopsOf(tx, stop.busId)).map((s) => s.id);
    const i = ids.indexOf(stopId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await resequence(tx, stop.busId, ids);
    await audit(tx, actor, "bus.moveStop", "Bus", stop.busId, { stopId, direction });
  });
}
