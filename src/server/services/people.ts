import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AccountStatus, Prisma, Role } from "@/generated/prisma/client";
import type { PersonCreateInput, PersonUpdateInput } from "@/lib/validation/entities";
import {
  assignableRoles,
  can,
  canEditPerson,
  canSetAttendeeHotel,
  canViewPerson,
  isStaff,
  type Actor,
} from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { audit } from "./audit";
import { OPTIONS_LIMIT, pageArgs, toPage } from "./pagination";

async function withUniquePhone<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("duplicatePhone");
    throw err;
  }
}

async function requireActiveHotel(tx: Prisma.TransactionClient, hotelId: string) {
  const hotel = await tx.hotel.findUnique({ where: { id: hotelId }, select: { isActive: true } });
  if (!hotel?.isActive) throw new AppError("invalid", "hotelInactive");
}

async function hasActiveTrip(tx: Prisma.TransactionClient, userId: string) {
  return (await tx.trip.count({ where: { coordinatorId: userId, endedAt: null } })) > 0;
}

/** Searches name, phone digits or exact id. Staff only. */
export async function listPeople(
  actor: Actor,
  opts: { q?: string; cursor?: string; role?: Role; status?: AccountStatus; hotelId?: string },
) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const digits = opts.q?.replace(/\D/g, "") ?? "";
  const where: Prisma.UserWhereInput = {
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.hotelId ? { hotelId: opts.hotelId } : {}),
    ...(opts.q
      ? {
          OR: [
            { name: { contains: opts.q, mode: "insensitive" } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            { id: opts.q },
          ],
        }
      : {}),
  };
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      hotel: { select: { id: true, name: true } },
      coordinatedHotel: { select: { id: true, name: true } },
      designatedBuses: { where: { isActive: true }, select: { id: true, label: true } },
    },
  });
  return toPage(rows);
}

export async function getPerson(actor: Actor, id: string) {
  const person = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      preferredLocale: true,
      createdAt: true,
      updatedAt: true,
      hotelId: true,
      hotel: { select: { id: true, name: true } },
      coordinatedHotel: { select: { id: true, name: true } },
      designatedBuses: { select: { id: true, label: true, isActive: true }, orderBy: { label: "asc" } },
      trips: {
        where: { endedAt: null },
        select: { id: true, status: true, bus: { select: { id: true, label: true } } },
      },
    },
  });
  if (!person) throw notFound();
  const scope = isStaff(actor) ? undefined : await loadScope(actor);
  if (!canViewPerson(actor, scope ?? { hotelIds: new Set(), operableBusIds: new Set() }, person)) throw notFound();
  return person;
}

export async function createPerson(actor: Actor, input: PersonCreateInput) {
  if (!assignableRoles(actor).includes(input.role)) throw forbidden();
  const hotelId = input.role === "CUSTOMER" ? (input.hotelId ?? null) : null;
  if (hotelId && !canSetAttendeeHotel(actor, null)) throw forbidden();
  return withUniquePhone(() =>
    prisma.$transaction(async (tx) => {
      if (hotelId) await requireActiveHotel(tx, hotelId);
      const user = await tx.user.create({
        data: { name: input.name, phone: input.phone, role: input.role, hotelId },
        select: { id: true },
      });
      await audit(tx, actor, "person.create", "User", user.id, { role: input.role, hotelId });
      return user;
    }),
  );
}

/** Name and phone. Changing the phone signs the person out everywhere. */
export async function updatePerson(actor: Actor, id: string, input: PersonUpdateInput) {
  return withUniquePhone(() =>
    prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, phone: true } });
      if (!target) throw notFound();
      if (!can(actor, "person.update") || !canEditPerson(actor, target)) throw forbidden();
      await tx.user.update({ where: { id }, data: { name: input.name, phone: input.phone } });
      const phoneChanged = target.phone !== input.phone;
      if (phoneChanged) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await audit(tx, actor, "person.update", "User", id, { phoneChanged });
    }),
  );
}

/** Attendee hotel allotment (Owner any time; Admin only the first allotment). */
export async function setPersonHotel(actor: Actor, id: string, hotelId: string | null) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { role: true, hotelId: true } });
    if (!target) throw notFound();
    if (target.role !== "CUSTOMER") throw new AppError("invalid", "notAttendee");
    if (!canSetAttendeeHotel(actor, target.hotelId)) throw forbidden();
    if (hotelId) await requireActiveHotel(tx, hotelId);
    await tx.user.update({ where: { id }, data: { hotelId } });
    await audit(tx, actor, "person.reassignHotel", "User", id, { from: target.hotelId, to: hotelId });
  });
}

/**
 * Owner only. Changing away from COORDINATOR removes their hotel and bus
 * designations; changing away from CUSTOMER removes their hotel allotment.
 */
export async function changeRole(actor: Actor, id: string, role: Role) {
  if (!can(actor, "person.changeRole") || !assignableRoles(actor).includes(role)) throw forbidden();
  if (id === actor.id) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) throw notFound();
    if (!canEditPerson(actor, target)) throw forbidden();
    if (target.role === role) return;
    if (target.role === "COORDINATOR") {
      if (await hasActiveTrip(tx, id)) throw conflict("personOnTrip");
      await tx.hotel.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
      await tx.bus.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
    }
    await tx.user.update({ where: { id }, data: { role, ...(role !== "CUSTOMER" ? { hotelId: null } : {}) } });
    await audit(tx, actor, "person.changeRole", "User", id, { from: target.role, to: role });
  });
}

/** Owner only. Deactivation signs the person out everywhere immediately. */
export async function setPersonStatus(actor: Actor, id: string, status: AccountStatus) {
  if (!can(actor, "person.deactivate")) throw forbidden();
  if (id === actor.id) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
    if (!target) throw notFound();
    if (!canEditPerson(actor, target)) throw forbidden();
    if (status === "INACTIVE" && (await hasActiveTrip(tx, id))) throw conflict("personOnTrip");
    await tx.user.update({ where: { id }, data: { status } });
    if (status === "INACTIVE") {
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(tx, actor, status === "INACTIVE" ? "person.deactivate" : "person.activate", "User", id);
  });
}

/** Active coordinators for dropdowns, with their current hotel. */
export async function coordinatorOptions(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  return prisma.user.findMany({
    where: { role: "COORDINATOR", status: "ACTIVE" },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true, coordinatedHotel: { select: { name: true } } },
  });
}
