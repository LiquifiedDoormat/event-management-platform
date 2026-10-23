import "server-only";
import { prisma } from "@/lib/db/prisma";
import { can, isStaff, type Actor } from "@/server/policies";
import { conflict, forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { eventOf } from "./context";

// A planning/history layer on top of Bus.coordinatorId. Bus.coordinatorId
// stays the single source of truth for who may actually start a trip today
// (trip-starting, scope.operableBusIds, live tracking are all unchanged by
// this file). This only records, and validates, who is *scheduled* to be
// responsible for a bus over a date range — useful for planning handovers
// and keeping a history, without touching the live operational path. See
// PROJECT_MEMORY.md's Phase 3 entry for why this boundary was chosen.

function rangesOverlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  const noOverlap = (aEnd !== null && aEnd < bStart) || (bEnd !== null && bEnd < aStart);
  return !noOverlap;
}

/** Full schedule for one bus, earliest first. Staff only (same audience as assigning a coordinator at all). */
export async function listAssignments(actor: Actor, busId: string) {
  if (!isStaff(actor)) throw forbidden();
  const eventId = eventOf(actor);
  const bus = await prisma.bus.findFirst({ where: { id: busId, hotel: { eventId } }, select: { id: true } });
  if (!bus) throw notFound();
  return prisma.busCoordinatorAssignment.findMany({
    where: { busId },
    orderBy: { startsOn: "asc" },
    select: { id: true, startsOn: true, endsOn: true, notes: true, coordinator: { select: { id: true, name: true, phone: true } } },
  });
}

/**
 * Schedules a coordinator for a bus over a date range. Rejects an overlap
 * with any existing assignment for that same bus (a bus has one responsible
 * coordinator at a time, even if planned ahead) rather than silently
 * double-booking it.
 */
export async function scheduleAssignment(
  actor: Actor,
  input: { busId: string; coordinatorId: string; startsOn: Date; endsOn: Date | null; notes: string },
) {
  if (!can(actor, "bus.assignCoordinator")) throw forbidden();
  const eventId = eventOf(actor);
  if (input.endsOn && input.endsOn < input.startsOn) throw conflict("endBeforeStart");

  const [bus, coordinator] = await Promise.all([
    prisma.bus.findFirst({ where: { id: input.busId, hotel: { eventId } }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: input.coordinatorId, role: "COORDINATOR", status: "ACTIVE", memberships: { some: { eventId } } },
      select: { id: true },
    }),
  ]);
  if (!bus) throw notFound();
  if (!coordinator) throw conflict("notActiveCoordinator");

  const existing = await prisma.busCoordinatorAssignment.findMany({
    where: { busId: input.busId },
    select: { startsOn: true, endsOn: true },
  });
  if (existing.some((e) => rangesOverlap(input.startsOn, input.endsOn, e.startsOn, e.endsOn))) {
    throw conflict("overlappingAssignment");
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.busCoordinatorAssignment.create({
      data: {
        busId: input.busId,
        coordinatorId: input.coordinatorId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        notes: input.notes || null,
        createdById: actor.id,
      },
    });
    await audit(tx, actor, "bus.scheduleCoordinator", "Bus", input.busId, {
      coordinatorId: input.coordinatorId,
      startsOn: input.startsOn.toISOString(),
      endsOn: input.endsOn?.toISOString() ?? null,
    });
    return created;
  });
}

/** Removes a planned/past assignment (does not touch Bus.coordinatorId). */
export async function removeAssignment(actor: Actor, id: string) {
  if (!can(actor, "bus.assignCoordinator")) throw forbidden();
  const eventId = eventOf(actor);
  const assignment = await prisma.busCoordinatorAssignment.findFirst({ where: { id, bus: { hotel: { eventId } } }, select: { id: true, busId: true } });
  if (!assignment) throw notFound();
  await prisma.$transaction(async (tx) => {
    await tx.busCoordinatorAssignment.delete({ where: { id } });
    await audit(tx, actor, "bus.removeScheduledCoordinator", "Bus", assignment.busId, { assignmentId: id });
  });
}
