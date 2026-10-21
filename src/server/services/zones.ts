import "server-only";
import { prisma } from "@/lib/db/prisma";
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
    if (zoneId) {
      const zone = await tx.zone.findFirst({ where: { id: zoneId, eventId, isActive: true }, select: { id: true } });
      if (!zone) throw notFound();
    }
    await tx.eventMember.update({ where: { id: membership.id }, data: { zoneId } });
    await audit(tx, actor, "zone.assignAttendee", "Zone", zoneId ?? membership.zoneId ?? "none", { userId, from: membership.zoneId, to: zoneId });
  });
}

/**
 * Bulk tool: assigns every active attendee of a hotel (or, with no hotel
 * filter, every active attendee with no zone yet) to one zone in a single
 * pass — for sorting a whole busload of attendees into a section at once.
 */
export async function bulkAssignZone(actor: Actor, opts: { zoneId: string; hotelId?: string }) {
  requireCan(actor, "zone.manageAssignments");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const zone = await tx.zone.findFirst({ where: { id: opts.zoneId, eventId, isActive: true }, select: { id: true } });
    if (!zone) throw notFound();
    if (opts.hotelId) {
      const hotel = await tx.hotel.findFirst({ where: { id: opts.hotelId, eventId }, select: { id: true } });
      if (!hotel) throw notFound();
    }
    const result = await tx.eventMember.updateMany({
      where: {
        eventId,
        user: { role: "CUSTOMER", status: "ACTIVE" },
        ...(opts.hotelId ? { hotelId: opts.hotelId } : { zoneId: null }),
      },
      data: { zoneId: opts.zoneId },
    });
    await audit(tx, actor, "zone.bulkAssign", "Zone", opts.zoneId, { hotelId: opts.hotelId ?? null, count: result.count });
    return { count: result.count };
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
