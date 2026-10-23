import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { GateInput, ZoneInput } from "@/lib/validation/entities";
import { can, type Actor } from "@/server/policies";
import { conflict, forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { OPTIONS_LIMIT, PAGE_SIZE, toPage } from "./pagination";
import { eventOf } from "./context";

export type ZoneFullness = "full" | "partial" | "empty";

/** `full` = zero seats left (requires a capacity); `empty` = zero guests allotted; `partial` = some guests and some seats left (or no capacity limit). */
function matchesFullness(z: { attendeeCount: number; seatsLeft: number | null }, fullness: ZoneFullness): boolean {
  if (fullness === "empty") return z.attendeeCount === 0;
  if (fullness === "full") return z.seatsLeft === 0;
  return z.attendeeCount > 0 && (z.seatsLeft === null || z.seatsLeft > 0);
}

// Venue zones (seating/sections) and their gates (Phase 5). An attendee is
// assigned to at most one zone (EventMember.zoneId); a gate optionally serves
// one zone, or is a general venue gate with no zone.

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

export async function listZones(actor: Actor, opts: { q?: string; cursor?: string; includeInactive?: boolean; fullness?: ZoneFullness }) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  // Fullness depends on comparing capacity against a live guest count, which
  // can't be expressed as a simple `where` clause — fetch every matching zone
  // (there are at most a few dozen, one per stadium section) and paginate the
  // filtered result in memory instead of pushing `fullness` into the query.
  const rows = await prisma.zone.findMany({
    where: {
      eventId,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      capacity: true,
      isActive: true,
      _count: { select: { gates: true, members: { where: { user: { role: "CUSTOMER", status: "ACTIVE" } } } } },
    },
  });
  const all = rows.map(({ _count, ...z }) => ({
    ...z,
    gateCount: _count.gates,
    attendeeCount: _count.members,
    seatsLeft: z.capacity === null ? null : Math.max(0, z.capacity - _count.members),
  }));
  const filtered = opts.fullness ? all.filter((z) => matchesFullness(z, opts.fullness!)) : all;
  const startIndex = opts.cursor ? filtered.findIndex((z) => z.id === opts.cursor) + 1 : 0;
  return toPage(filtered.slice(startIndex, startIndex + PAGE_SIZE + 1));
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

    const eligibleWhere = {
      eventId,
      zoneId: null,
      user: { role: "CUSTOMER" as const, status: "ACTIVE" as const },
      ...(opts.hotelId ? { hotelId: opts.hotelId } : {}),
    };
    // Counted against the *unmodified* pool, before the update below moves
    // some of these guests into the zone — counting afterwards would make
    // "skipped" undercount by however many just got assigned.
    const totalEligible = await tx.eventMember.count({ where: eligibleWhere });

    const candidates = await tx.eventMember.findMany({
      where: eligibleWhere,
      orderBy: { user: { name: "asc" } },
      select: { id: true },
      ...(remaining !== null ? { take: remaining } : {}),
    });
    if (candidates.length > 0) {
      await tx.eventMember.updateMany({ where: { id: { in: candidates.map((c) => c.id) } }, data: { zoneId: opts.zoneId } });
    }

    // How many were eligible but didn't fit, so the UI can say so — not just
    // how many fit.
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

/**
 * Hotels still worth offering in the bulk-assign hotel dropdown: those with at
 * least one active guest who has no seating zone yet. A hotel disappears only
 * once every one of its active guests has been allocated to some zone; a
 * partially-allocated hotel keeps showing up (with its remaining count) so it
 * stays available for a second, third, etc. zone.
 */
export async function hotelsWithUnallocatedGuests(actor: Actor) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  const rows = await prisma.hotel.findMany({
    where: { eventId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { members: { where: { zoneId: null, user: { role: "CUSTOMER", status: "ACTIVE" } } } } },
    },
  });
  return rows
    .filter((h) => h._count.members > 0)
    .map((h) => ({ id: h.id, name: h.name, unallocated: h._count.members }));
}

/** Hotels represented among a zone's currently-allocated guests, with a count each — for the zone's own detail view. */
export async function zoneHotelBreakdown(actor: Actor, zoneId: string) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  const rows = await prisma.eventMember.groupBy({
    by: ["hotelId"],
    where: { eventId, zoneId, hotelId: { not: null }, user: { role: "CUSTOMER", status: "ACTIVE" } },
    _count: { _all: true },
  });
  const hotelIds = rows.map((r) => r.hotelId!);
  const hotels = hotelIds.length ? await prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(hotels.map((h) => [h.id, h.name]));
  return rows
    .map((r) => ({ hotelId: r.hotelId!, hotelName: nameOf.get(r.hotelId!) ?? "—", count: r._count._all }))
    .sort((a, b) => a.hotelName.localeCompare(b.hotelName));
}

/** A hotel's active guests grouped by seating zone (and unallocated) — for the hotel's own detail view. */
export async function hotelZoneBreakdown(actor: Actor, hotelId: string) {
  requireCan(actor, "dashboard.viewAll");
  const eventId = eventOf(actor);
  const rows = await prisma.eventMember.groupBy({
    by: ["zoneId"],
    where: { eventId, hotelId, user: { role: "CUSTOMER", status: "ACTIVE" } },
    _count: { _all: true },
  });
  const zoneIds = rows.map((r) => r.zoneId).filter((id): id is string => id !== null);
  const zoneList = zoneIds.length ? await prisma.zone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(zoneList.map((z) => [z.id, z.name]));
  return rows
    .map((r) => ({ zoneId: r.zoneId, zoneName: r.zoneId ? (nameOf.get(r.zoneId) ?? "—") : null, count: r._count._all }))
    .sort((a, b) => (a.zoneName ?? "").localeCompare(b.zoneName ?? ""));
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
