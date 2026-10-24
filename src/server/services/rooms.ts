import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RoomInput } from "@/lib/validation/entities";
import { can, canManageRoomAssignment, isStaff, type Actor } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { audit } from "./audit";
import { eventOf } from "./context";

// Hotel room inventory and per-guest room assignment (Phase 4). A room
// belongs to one hotel; a guest's room (like their zone) lives on their
// EventMember row. Same capacity-safe-under-concurrency pattern as zones.ts:
// lock the room row, count current occupants, then decide.

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

async function requireHotel(eventId: string, hotelId: string) {
  const hotel = await prisma.hotel.findFirst({ where: { id: hotelId, eventId }, select: { id: true } });
  if (!hotel) throw notFound();
}

/** A hotel's room inventory, each with its current occupancy — staff, or a cluster coordinator for a hotel in their cluster. */
export async function listRooms(actor: Actor, hotelId: string) {
  if (!can(actor, "dashboard.viewAll")) {
    if (actor.role !== "CLUSTER_COORDINATOR" || !(await loadScope(actor)).hotelIds.has(hotelId)) throw forbidden();
  }
  const eventId = eventOf(actor);
  await requireHotel(eventId, hotelId);
  const rows = await prisma.room.findMany({
    where: { hotelId },
    orderBy: [{ label: "asc" }],
    select: { id: true, label: true, capacity: true, notes: true, isActive: true, _count: { select: { occupants: true } } },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, occupied: _count.occupants }));
}

export async function createRoom(actor: Actor, hotelId: string, input: RoomInput) {
  requireCan(actor, "room.manage");
  const eventId = eventOf(actor);
  await requireHotel(eventId, hotelId);
  try {
    return await prisma.$transaction(async (tx) => {
      const room = await tx.room.create({ data: { hotelId, ...input }, select: { id: true } });
      await audit(tx, actor, "room.create", "Room", room.id, { hotelId, label: input.label });
      return room;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("duplicateRoomLabel");
    throw err;
  }
}

export async function updateRoom(actor: Actor, id: string, input: RoomInput) {
  requireCan(actor, "room.manage");
  const eventId = eventOf(actor);
  const room = await prisma.room.findFirst({ where: { id, hotel: { eventId } }, select: { id: true } });
  if (!room) throw notFound();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id }, data: { ...input, notes: input.notes ?? null } });
      await audit(tx, actor, "room.update", "Room", id, { fields: Object.keys(input) });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("duplicateRoomLabel");
    throw err;
  }
}

export async function setRoomActive(actor: Actor, id: string, isActive: boolean) {
  requireCan(actor, "room.manage");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findFirst({
      where: { id, hotel: { eventId } },
      select: { _count: { select: { occupants: { where: { user: { status: "ACTIVE" } } } } } },
    });
    if (!room) throw notFound();
    if (!isActive && room._count.occupants > 0) throw conflict("roomInUse");
    await tx.room.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? "room.activate" : "room.deactivate", "Room", id);
  });
}

/**
 * Locks the room row (so two concurrent assignments can't both pass the
 * capacity check) and returns how many more guests it can take.
 */
async function lockRoomRemaining(tx: Prisma.TransactionClient, roomId: string, hotelId: string): Promise<number> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Room" WHERE id = ${roomId} AND "hotelId" = ${hotelId} FOR UPDATE`;
  if (locked.length === 0) throw notFound();
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId }, select: { capacity: true, isActive: true } });
  if (!room.isActive) throw notFound();
  const current = await tx.eventMember.count({ where: { roomId } });
  return room.capacity - current;
}

/**
 * Assigns (or clears, with `roomId: null`) one guest's room. The room must
 * belong to the guest's own hotel — never lets someone be placed in another
 * hotel's room.
 */
export async function setPersonRoom(actor: Actor, userId: string, roomId: string | null) {
  const eventId = eventOf(actor);
  const scope = isStaff(actor) ? { hotelIds: new Set<string>(), operableBusIds: new Set<string>() } : await loadScope(actor);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.eventMember.findFirst({
      where: { eventId, userId, user: { role: "CUSTOMER" } },
      select: { id: true, hotelId: true, roomId: true },
    });
    if (!membership) throw notFound();
    if (!canManageRoomAssignment(actor, scope, membership)) throw forbidden();
    if (roomId && roomId !== membership.roomId) {
      if (!membership.hotelId) throw new AppError("invalid", "notAttendee");
      const remaining = await lockRoomRemaining(tx, roomId, membership.hotelId);
      if (remaining <= 0) throw conflict("roomFull");
    }
    await tx.eventMember.update({ where: { id: membership.id }, data: { roomId } });
    await audit(tx, actor, "room.assignAttendee", "Room", roomId ?? membership.roomId ?? "none", { userId, from: membership.roomId, to: roomId });
  });
}
