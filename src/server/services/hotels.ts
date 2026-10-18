import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { HotelInput } from "@/lib/validation/entities";
import { can, type Actor } from "@/server/policies";
import { AppError, conflict, forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { OPTIONS_LIMIT, pageArgs, toPage } from "./pagination";

function requireCan(actor: Actor, action: Parameters<typeof can>[1]) {
  if (!can(actor, action)) throw forbidden();
}

export async function listHotels(actor: Actor, opts: { q?: string; cursor?: string; includeInactive?: boolean }) {
  requireCan(actor, "dashboard.viewAll");
  const where: Prisma.HotelWhereInput = {
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
      coordinator: { select: { id: true, name: true } },
      _count: {
        select: {
          buses: { where: { isActive: true } },
          attendees: { where: { role: "CUSTOMER", status: "ACTIVE" } },
        },
      },
    },
  });
  return toPage(rows);
}

export async function getHotel(actor: Actor, id: string) {
  requireCan(actor, "dashboard.viewAll");
  const hotel = await prisma.hotel.findUnique({
    where: { id },
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
      coordinator: { select: { id: true, name: true, phone: true, status: true } },
      buses: {
        orderBy: { label: "asc" },
        select: { id: true, label: true, registration: true, isActive: true },
      },
      _count: { select: { attendees: { where: { role: "CUSTOMER", status: "ACTIVE" } } } },
    },
  });
  if (!hotel) throw notFound();
  return hotel;
}

export async function createHotel(actor: Actor, input: HotelInput) {
  requireCan(actor, "hotel.create");
  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.create({ data: input, select: { id: true } });
    await audit(tx, actor, "hotel.create", "Hotel", hotel.id, { name: input.name });
    return hotel;
  });
}

export async function updateHotel(actor: Actor, id: string, input: HotelInput) {
  requireCan(actor, "hotel.update");
  return prisma.$transaction(async (tx) => {
    const before = await tx.hotel.findUnique({ where: { id }, select: { id: true } });
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
    const hotel = await tx.hotel.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            buses: { where: { isActive: true } },
            attendees: { where: { status: "ACTIVE" } },
          },
        },
      },
    });
    if (!hotel) throw notFound();
    if (!isActive && (hotel._count.buses > 0 || hotel._count.attendees > 0)) throw conflict("hotelInUse");
    await tx.hotel.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? "hotel.activate" : "hotel.deactivate", "Hotel", id);
  });
}

/**
 * Owner only. Sets (or clears) a hotel's designated coordinator. A coordinator
 * designates at most one hotel, so they are moved off any previous hotel.
 */
export async function assignHotelCoordinator(actor: Actor, hotelId: string, coordinatorId: string | null) {
  requireCan(actor, "hotel.assignCoordinator");
  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.findUnique({ where: { id: hotelId }, select: { coordinatorId: true } });
    if (!hotel) throw notFound();
    let movedFrom: string | null = null;
    if (coordinatorId) {
      const coordinator = await tx.user.findUnique({
        where: { id: coordinatorId },
        select: { role: true, status: true, coordinatedHotel: { select: { id: true } } },
      });
      if (!coordinator || coordinator.role !== "COORDINATOR" || coordinator.status !== "ACTIVE") {
        throw new AppError("invalid", "notActiveCoordinator");
      }
      movedFrom = coordinator.coordinatedHotel?.id ?? null;
      if (movedFrom && movedFrom !== hotelId) {
        await tx.hotel.update({ where: { id: movedFrom }, data: { coordinatorId: null } });
      }
    }
    await tx.hotel.update({ where: { id: hotelId }, data: { coordinatorId } });
    await audit(tx, actor, "hotel.assignCoordinator", "Hotel", hotelId, {
      from: hotel.coordinatorId,
      to: coordinatorId,
      ...(movedFrom && movedFrom !== hotelId ? { removedFromHotel: movedFrom } : {}),
    });
  });
}

/** Active hotels for dropdowns. */
export async function hotelOptions(actor: Actor) {
  requireCan(actor, "dashboard.viewAll");
  return prisma.hotel.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true },
  });
}
