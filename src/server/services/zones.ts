import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { GateInput, ZoneInput } from "@/lib/validation/entities";
import { can, type Actor } from "@/server/policies";
import { conflict, forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { OPTIONS_LIMIT, pageArgs, toPage } from "./pagination";
import { eventOf } from "./context";

// Venue zones (seating/sections) and their gates (Phase 5). An attendee is
// assigned to at most one zone (EventMember.zoneId); a gate optionally serves
// one zone, or is a general venue gate with no zone.

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

export async function listZones(actor: Actor, opts: { q?: string; cursor?: string; includeInactive?: boolean }) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  const rows = await prisma.zone.findMany({
    where: {
      eventId,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      name: true,
      capacity: true,
      isActive: true,
      _count: { select: { gates: true, members: { where: { user: { role: "CUSTOMER", status: "ACTIVE" } } } } },
    },
  });
  const page = toPage(rows);
  return { ...page, items: page.items.map(({ _count, ...z }) => ({ ...z, gateCount: _count.gates, attendeeCount: _count.members })) };
}

export async function getZone(actor: Actor, id: string) {
  requireCan(actor, "dashboard.viewAll");
  const zone = await prisma.zone.findFirst({
    where: { id, eventId: eventOf(actor) },
    select: {
      id: true,
      name: true,
      capacity: true,
      notes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      gates: { orderBy: { name: "asc" }, select: { id: true, name: true, notes: true } },
      _count: { select: { members: { where: { user: { role: "CUSTOMER", status: "ACTIVE" } } } } },
    },
  });
  if (!zone) throw notFound();
  const { _count, ...rest } = zone;
  return { ...rest, attendeeCount: _count.members };
}

export async function createZone(actor: Actor, input: ZoneInput) {
  requireCan(actor, "zone.create");
  return prisma.$transaction(async (tx) => {
    const zone = await tx.zone.create({ data: { ...input, eventId: eventOf(actor) }, select: { id: true } });
    await audit(tx, actor, "zone.create", "Zone", zone.id, { name: input.name });
    return zone;
  });
}

export async function updateZone(actor: Actor, id: string, input: ZoneInput) {
  requireCan(actor, "zone.update");
  return prisma.$transaction(async (tx) => {
    const before = await tx.zone.findFirst({ where: { id, eventId: eventOf(actor) }, select: { id: true } });
    if (!before) throw notFound();
    await tx.zone.update({ where: { id }, data: { ...input, capacity: input.capacity ?? null, notes: input.notes ?? null } });
    await audit(tx, actor, "zone.update", "Zone", id, { fields: Object.keys(input) });
  });
}

export async function setZoneActive(actor: Actor, id: string, isActive: boolean) {
  requireCan(actor, "zone.deactivate");
  return prisma.$transaction(async (tx) => {
    const zone = await tx.zone.findFirst({
      where: { id, eventId: eventOf(actor) },
      select: { _count: { select: { members: { where: { user: { status: "ACTIVE" } } } } } },
    });
    if (!zone) throw notFound();
    if (!isActive && zone._count.members > 0) throw conflict("zoneInUse");
    await tx.zone.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? "zone.activate" : "zone.deactivate", "Zone", id);
  });
}

export async function addGate(actor: Actor, input: GateInput) {
  requireCan(actor, "zone.manageGates");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    if (input.zoneId) {
      const zone = await tx.zone.findFirst({ where: { id: input.zoneId, eventId }, select: { id: true } });
      if (!zone) throw notFound();
    }
    const gate = await tx.gate.create({ data: { name: input.name, notes: input.notes, zoneId: input.zoneId ?? null, eventId }, select: { id: true } });
    await audit(tx, actor, "gate.create", "Gate", gate.id, { name: input.name, zoneId: input.zoneId ?? null });
    return gate;
  });
}

/** Hard-deleted, like bus stops — a gate is a venue layout detail, not a record with its own history. */
export async function removeGate(actor: Actor, id: string) {
  requireCan(actor, "zone.manageGates");
  const gate = await prisma.gate.findFirst({ where: { id, eventId: eventOf(actor) }, select: { id: true } });
  if (!gate) throw notFound();
  await prisma.gate.delete({ where: { id } });
}

/**
 * Locks the zone row (so two concurrent assignments can't both pass the
 * capacity check) and returns how many more guests it can take — `null`
 * means uncapped. Caller is already inside `tx`'s transaction.
 */
async function lockZoneRemaining(tx: Prisma.TransactionClient, zoneId: string, eventId: string): Promise<number | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Zone" WHERE id = ${zoneId} AND "eventId" = ${eventId} FOR UPDATE`;
  if (locked.length === 0) throw notFound();
  const zone = await tx.zone.findUniqueOrThrow({ where: { id: zoneId }, select: { capacity: true, isActive: true } });
  if (!zone.isActive) throw notFound();
  if (zone.capacity === null) return null;
  const current = await tx.eventMember.count({ where: { zoneId } });
  return zone.capacity - current;
}

/** Single-attendee zone assignment (or clearing it with `zoneId: null`). */
export async function setPersonZone(actor: Actor, userId: string, zoneId: string | null) {
  requireCan(actor, "zone.manageAssignments");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.eventMember.findFirst({
      where: { eventId, userId, user: { role: "CUSTOMER" } },
      select: { id: true, zoneId: true },
    });
    if (!membership) throw notFound();
    // Already there, or just clearing: no capacity check needed either way.
    if (zoneId && zoneId !== membership.zoneId) {
      const remaining = await lockZoneRemaining(tx, zoneId, eventId);
      if (remaining !== null && remaining <= 0) throw conflict("zoneFull");
    }
    await tx.eventMember.update({ where: { id: membership.id }, data: { zoneId } });
    await audit(tx, actor, "zone.assignAttendee", "Zone", zoneId ?? membership.zoneId ?? "none", { userId, from: membership.zoneId, to: zoneId });
  });
}

/**
 * Bulk tool: assigns active attendees of a hotel (or, with no hotel filter,
 * every active attendee with no zone yet) to one zone in a single pass — for
 * sorting a whole busload of attendees into a section at once.
 *
 * `mode: "add"` only fills the zone's *remaining* capacity, in a stable order
 * (name), and reports how many were left unassigned if it's not enough —
 * the caller picks another zone for the rest rather than silently
 * overflowing it. `mode: "replace"` first clears everyone currently in the
 * zone (a destructive step the UI must confirm before calling this), then
 * fills it the same capacity-aware way with the new group.
 */
export async function bulkAssignZone(actor: Actor, opts: { zoneId: string; hotelId?: string; mode: "add" | "replace" }) {
  requireCan(actor, "zone.manageAssignments");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    if (opts.hotelId) {
      const hotel = await tx.hotel.findFirst({ where: { id: opts.hotelId, eventId }, select: { id: true } });
      if (!hotel) throw notFound();
    }
    let replaced = 0;
    if (opts.mode === "replace") {
      const cleared = await tx.eventMember.updateMany({ where: { eventId, zoneId: opts.zoneId }, data: { zoneId: null } });
      replaced = cleared.count;
    }
    const remaining = await lockZoneRemaining(tx, opts.zoneId, eventId);

    const candidates = await tx.eventMember.findMany({
      where: {
        eventId,
        zoneId: null,
        user: { role: "CUSTOMER", status: "ACTIVE" },
        ...(opts.hotelId ? { hotelId: opts.hotelId } : {}),
      },
      orderBy: { user: { name: "asc" } },
      select: { id: true },
      ...(remaining !== null ? { take: remaining } : {}),
    });
    if (candidates.length > 0) {
      await tx.eventMember.updateMany({ where: { id: { in: candidates.map((c) => c.id) } }, data: { zoneId: opts.zoneId } });
    }

    // Count how many were eligible but didn't fit, so the UI can say so —
    // not just how many fit.
    const totalEligible = await tx.eventMember.count({
      where: { eventId, user: { role: "CUSTOMER", status: "ACTIVE" }, ...(opts.hotelId ? { hotelId: opts.hotelId } : { zoneId: null }) },
    });
    const skipped = Math.max(0, totalEligible - candidates.length);

    await audit(tx, actor, "zone.bulkAssign", "Zone", opts.zoneId, {
      hotelId: opts.hotelId ?? null,
      mode: opts.mode,
      count: candidates.length,
      replaced,
      skipped,
    });
    return { count: candidates.length, skipped, replaced };
  });
}

/** Zones for dropdowns (active only). */
export async function zoneOptions(actor: Actor) {
  requireCan(actor, "dashboard.viewAll");
  return prisma.zone.findMany({
    where: { isActive: true, eventId: eventOf(actor) },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true },
  });
}
