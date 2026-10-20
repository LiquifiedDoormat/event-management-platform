import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { HotelInput } from "@/lib/validation/entities";
import { can, type Actor } from "@/server/policies";
import { AppError, conflict, forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { OPTIONS_LIMIT, pageArgs, toPage } from "./pagination";
import { eventOf } from "./context";

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

export async function listHotels(actor: Actor, opts: { q?: string; cursor?: string; includeInactive?: boolean }) {
  requireCan(actor, "dashboard.viewAll");
  const where: Prisma.HotelWhereInput = {
    eventId: eventOf(actor),
    ...(opts.includeInactive ? {} : { isActive: true }),
    ...(opts.q
      ? {
          OR: [
            { name: { contains: opts.q, mode: "insensitive" } },
            { address: { contains: opts.q, mode: "insensitive" } },
            { id: opts.q },
          ],
        }
      : {}),
  };
  const rows = await prisma.hotel.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      name: true,
      address: true,
      isActive: true,
      members: { where: { user: { role: "COORDINATOR", status: "ACTIVE" } }, select: { user: { select: { id: true, name: true } } } },
      _count: {
        select: {
          buses: { where: { isActive: true } },
          members: { where: { user: { role: "CUSTOMER", status: "ACTIVE" } } },
        },
      },
    },
  });
  return toPage(rows.map(({ members, ...h }) => ({ ...h, coordinators: members.map((m) => m.user) })));
}

export async function getHotel(actor: Actor, id: string) {
  requireCan(actor, "dashboard.viewAll");
  const hotel = await prisma.hotel.findFirst({
    where: { id, eventId: eventOf(actor) },
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      notes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      members: {
        where: { user: { role: "COORDINATOR" } },
        orderBy: { user: { name: "asc" } },
        select: { user: { select: { id: true, name: true, phone: true, status: true } } },
      },
      buses: {
        orderBy: { label: "asc" },
        select: { id: true, label: true, registration: true, isActive: true },
      },
      _count: { select: { members: { where: { user: { role: "CUSTOMER", status: "ACTIVE" } } } } },
    },
  });
  if (!hotel) throw notFound();
  const { members, ...rest } = hotel;
  return { ...rest, coordinators: members.map((m) => m.user) };
}

export async function createHotel(actor: Actor, input: HotelInput) {
  requireCan(actor, "hotel.create");
  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.create({ data: { ...input, eventId: eventOf(actor) }, select: { id: true } });
    await audit(tx, actor, "hotel.create", "Hotel", hotel.id, { name: input.name });
    return hotel;
  });
}

export async function updateHotel(actor: Actor, id: string, input: HotelInput) {
  requireCan(actor, "hotel.update");
  return prisma.$transaction(async (tx) => {
    const before = await tx.hotel.findFirst({ where: { id, eventId: eventOf(actor) }, select: { id: true } });
    if (!before) throw notFound();
    await tx.hotel.update({
      where: { id },
      data: {
        ...input,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        notes: input.notes ?? null,
      },
    });
    await audit(tx, actor, "hotel.update", "Hotel", id, { fields: Object.keys(input) });
  });
}

/** Owner only. A hotel with active buses or attendees can't be deactivated. */
export async function setHotelActive(actor: Actor, id: string, isActive: boolean) {
  requireCan(actor, "hotel.deactivate");
  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.findFirst({
      where: { id, eventId: eventOf(actor) },
      select: {
        _count: {
          select: {
            buses: { where: { isActive: true } },
            members: { where: { user: { status: "ACTIVE" } } },
          },
        },
      },
    });
    if (!hotel) throw notFound();
    if (!isActive && (hotel._count.buses > 0 || hotel._count.members > 0)) throw conflict("hotelInUse");
    await tx.hotel.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? "hotel.activate" : "hotel.deactivate", "Hotel", id);
  });
}

/**
 * Adds an active coordinator to a hotel's roster. Several coordinators may
 * share a hotel, but each coordinator is assigned to at most one hotel, so
 * adding them here moves them off whatever hotel they held before.
 */
export async function addHotelCoordinator(actor: Actor, hotelId: string, coordinatorId: string) {
  requireCan(actor, "hotel.manageCoordinators");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.findFirst({ where: { id: hotelId, eventId }, select: { id: true } });
    if (!hotel) throw notFound();
    const coordinator = await tx.user.findFirst({ where: { id: coordinatorId, role: "COORDINATOR", status: "ACTIVE" }, select: { id: true } });
    if (!coordinator) throw new AppError("invalid", "notActiveCoordinator");
    const membership = await tx.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId: coordinatorId } },
      select: { id: true, hotelId: true },
    });
    if (!membership) throw new AppError("invalid", "notActiveCoordinator");
    if (membership.hotelId === hotelId) return;
    await tx.eventMember.update({ where: { id: membership.id }, data: { hotelId } });
    await audit(tx, actor, "hotel.addCoordinator", "Hotel", hotelId, { coordinatorId, movedFrom: membership.hotelId });
  });
}

/** Removes a coordinator from a hotel's roster. Their account is untouched, just unassigned. */
export async function removeHotelCoordinator(actor: Actor, hotelId: string, coordinatorId: string) {
  requireCan(actor, "hotel.manageCoordinators");
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.eventMember.findFirst({ where: { eventId, userId: coordinatorId, hotelId }, select: { id: true } });
    if (!membership) throw notFound();
    await tx.eventMember.update({ where: { id: membership.id }, data: { hotelId: null } });
    await audit(tx, actor, "hotel.removeCoordinator", "Hotel", hotelId, { coordinatorId });
  });
}

/** Active hotels for dropdowns. */
export async function hotelOptions(actor: Actor) {
  requireCan(actor, "dashboard.viewAll");
  return prisma.hotel.findMany({
    where: { isActive: true, eventId: eventOf(actor) },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true },
  });
}
