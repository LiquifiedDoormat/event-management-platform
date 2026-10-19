import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AccountStatus, Prisma, Role } from "@/generated/prisma/client";
import type { PersonCreateInput, PersonUpdateInput } from "@/lib/validation/entities";
import {
  assignableRoles,
  can,
  canEditPerson,
  canResetPin,
  canSetAttendeeHotel,
  canViewPerson,
  isStaff,
  type Actor,
} from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { audit } from "./audit";
import { clearPin } from "./auth";
import { eventOf } from "./context";
import { OPTIONS_LIMIT, pageArgs, toPage } from "./pagination";

// People are global accounts (one per phone number). Attendees and
// coordinators take part in an event through an EventMember row, which also
// holds the attendee's hotel for that event. Owner/Admin accounts are staff
// and appear in every event's directory.

const STAFF_ROLES: Role[] = ["OWNER", "ADMIN"];
const PRIVILEGED: Role[] = ["OWNER", "ADMIN", "COORDINATOR"];

/** Accounts visible in an event's directory: its members plus staff. */
const inEvent = (eventId: string): Prisma.UserWhereInput => ({
  OR: [{ memberships: { some: { eventId } } }, { role: { in: STAFF_ROLES } }],
});

async function requireActiveHotel(tx: Prisma.TransactionClient, hotelId: string, eventId: string) {
  const hotel = await tx.hotel.findFirst({ where: { id: hotelId, eventId }, select: { isActive: true } });
  if (!hotel?.isActive) throw new AppError("invalid", "hotelInactive");
}

async function hasActiveTrip(tx: Prisma.TransactionClient, userId: string) {
  return (await tx.trip.count({ where: { coordinatorId: userId, endedAt: null } })) > 0;
}

/** A person as seen from the actor's event, or not_found if they aren't part of it. */
async function findInEvent(tx: Prisma.TransactionClient, id: string, eventId: string) {
  const user = await tx.user.findFirst({
    where: { id, ...inEvent(eventId) },
    select: { id: true, role: true, phone: true, memberships: { where: { eventId }, select: { id: true, hotelId: true } } },
  });
  if (!user) throw notFound();
  return { ...user, membership: user.memberships[0] ?? null };
}

const listSelect = (eventId: string) =>
  ({
    id: true,
    name: true,
    phone: true,
    role: true,
    status: true,
    memberships: { where: { eventId }, select: { hotel: { select: { id: true, name: true } } } },
    coordinatedHotels: { where: { eventId }, select: { id: true, name: true } },
    designatedBuses: { where: { isActive: true, hotel: { eventId } }, select: { id: true, label: true } },
  }) satisfies Prisma.UserSelect;

function searchWhere(q?: string): Prisma.UserWhereInput {
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      { id: q },
    ],
  };
}

const shape = <T extends { memberships: { hotel: { id: string; name: string } | null }[]; coordinatedHotels: { id: string; name: string }[] }>(p: T) => {
  const { memberships, coordinatedHotels, ...rest } = p;
  return { ...rest, hotel: memberships[0]?.hotel ?? null, coordinatedHotel: coordinatedHotels[0] ?? null };
};

/** Directory of the current event: search by name, phone digits or exact id. Staff only. */
export async function listPeople(
  actor: Actor,
  opts: { q?: string; cursor?: string; role?: Role; status?: AccountStatus; hotelId?: string },
) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        inEvent(eventId),
        searchWhere(opts.q),
        opts.role ? { role: opts.role } : {},
        opts.status ? { status: opts.status } : {},
        opts.hotelId ? { memberships: { some: { eventId, hotelId: opts.hotelId } } } : {},
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: listSelect(eventId),
  });
  const page = toPage(rows);
  return { ...page, items: page.items.map(shape) };
}

/**
 * Coordinator's attendee list: active attendees of the hotels the coordinator
 * is responsible for in the current event. Filtering is done in the database.
 */
export async function listMyAttendees(actor: Actor, opts: { q?: string; cursor?: string }) {
  if (actor.role !== "COORDINATOR") throw forbidden();
  const eventId = eventOf(actor);
  const hotelIds = [...(await loadScope(actor)).hotelIds];
  if (hotelIds.length === 0) return { items: [], nextCursor: null };
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        { role: "CUSTOMER", status: "ACTIVE", memberships: { some: { eventId, hotelId: { in: hotelIds } } } },
        searchWhere(opts.q),
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: { id: true, name: true, phone: true, memberships: { where: { eventId }, select: { hotel: { select: { id: true, name: true } } } } },
  });
  const page = toPage(rows);
  return { ...page, items: page.items.map(({ memberships, ...p }) => ({ ...p, hotel: memberships[0]?.hotel ?? null })) };
}

export async function getPerson(actor: Actor, id: string) {
  const eventId = eventOf(actor);
  const person = await prisma.user.findFirst({
    where: { id, ...inEvent(eventId) },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      preferredLocale: true,
      createdAt: true,
      updatedAt: true,
      pinHash: true,
      pinLockedUntil: true,
      memberships: { where: { eventId }, select: { hotel: { select: { id: true, name: true } } } },
      coordinatedHotels: { where: { eventId }, select: { id: true, name: true } },
      designatedBuses: { where: { hotel: { eventId } }, select: { id: true, label: true, isActive: true }, orderBy: { label: "asc" } },
      trips: {
        where: { endedAt: null, bus: { hotel: { eventId } } },
        select: { id: true, status: true, bus: { select: { id: true, label: true } } },
      },
    },
  });
  if (!person) throw notFound();
  const { pinHash, pinLockedUntil, ...rest } = shape(person);
  const result = {
    ...rest,
    hotelId: rest.hotel?.id ?? null,
    // PIN status only (never the hash), for privileged accounts.
    pin: PRIVILEGED.includes(person.role)
      ? {
          isSet: Boolean(pinHash),
          lockedUntil: pinLockedUntil && pinLockedUntil > new Date() ? pinLockedUntil : null,
        }
      : null,
  };
  const scope = isStaff(actor) ? { hotelIds: new Set<string>(), operableBusIds: new Set<string>() } : await loadScope(actor);
  if (!canViewPerson(actor, scope, result)) throw notFound();
  return result;
}

export type CreatePersonResult = { id: string; addedExisting?: boolean };

/**
 * Creates an account (or registers an existing attendee/coordinator for the
 * current event). Admin/Coordinator accounts start without a PIN and choose one
 * at their first sign-in.
 */
export async function createPerson(actor: Actor, input: PersonCreateInput): Promise<CreatePersonResult> {
  if (!assignableRoles(actor).includes(input.role)) throw forbidden();
  const eventId = eventOf(actor);
  const hotelId = input.role === "CUSTOMER" ? (input.hotelId ?? null) : null;
  if (hotelId && !canSetAttendeeHotel(actor, null)) throw forbidden();
  const member = input.role === "CUSTOMER" || input.role === "COORDINATOR";

  return prisma.$transaction(async (tx) => {
    if (hotelId) await requireActiveHotel(tx, hotelId, eventId);
    const existing = await tx.user.findUnique({
      where: { phone: input.phone },
      select: { id: true, role: true, memberships: { where: { eventId }, select: { id: true } } },
    });
    if (existing) {
      // Same person joining another event: add a membership, keep their account.
      if (!member || existing.role !== input.role || existing.memberships.length > 0) throw conflict("duplicatePhone");
      await tx.eventMember.create({ data: { eventId, userId: existing.id, hotelId } });
      await audit(tx, actor, "person.addToEvent", "User", existing.id, { eventId, hotelId });
      return { id: existing.id, addedExisting: true };
    }
    const user = await tx.user.create({
      data: { name: input.name, phone: input.phone, role: input.role, ...(member ? { memberships: { create: { eventId, hotelId } } } : {}) },
      select: { id: true },
    });
    await audit(tx, actor, "person.create", "User", user.id, { role: input.role, eventId: member ? eventId : null, hotelId });
    return { id: user.id };
  });
}

/** Name and phone. Changing the phone signs the person out everywhere. */
export async function updatePerson(actor: Actor, id: string, input: PersonUpdateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const target = await findInEvent(tx, id, eventOf(actor));
      if (!can(actor, "person.update") || !canEditPerson(actor, target)) throw forbidden();
      await tx.user.update({ where: { id }, data: { name: input.name, phone: input.phone } });
      const phoneChanged = target.phone !== input.phone;
      if (phoneChanged) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, actor, "person.update", "User", id, { phoneChanged });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("duplicatePhone");
    throw err;
  }
}

/** Attendee hotel in the current event (Owner any time; Admin only the first allotment). */
export async function setPersonHotel(actor: Actor, id: string, hotelId: string | null) {
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const target = await findInEvent(tx, id, eventId);
    if (target.role !== "CUSTOMER" || !target.membership) throw new AppError("invalid", "notAttendee");
    if (!canSetAttendeeHotel(actor, target.membership.hotelId)) throw forbidden();
    if (hotelId) await requireActiveHotel(tx, hotelId, eventId);
    await tx.eventMember.update({ where: { id: target.membership.id }, data: { hotelId } });
    await audit(tx, actor, "person.reassignHotel", "User", id, { eventId, from: target.membership.hotelId, to: hotelId });
  });
}

/**
 * Owner only. Leaving COORDINATOR removes hotel and bus designations (all
 * events); leaving CUSTOMER removes hotel allotments. Becoming an attendee or
 * coordinator registers the person for the current event.
 */
export async function changeRole(actor: Actor, id: string, role: Role) {
  if (!can(actor, "person.changeRole") || !assignableRoles(actor).includes(role)) throw forbidden();
  if (id === actor.id) throw forbidden();
  const eventId = eventOf(actor);
  return prisma.$transaction(async (tx) => {
    const target = await findInEvent(tx, id, eventId);
    if (!canEditPerson(actor, target)) throw forbidden();
    if (target.role === role) return;
    if (target.role === "COORDINATOR") {
      if (await hasActiveTrip(tx, id)) throw conflict("personOnTrip");
      await tx.hotel.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
      await tx.bus.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
    }
    if (target.role === "CUSTOMER") await tx.eventMember.updateMany({ where: { userId: id }, data: { hotelId: null } });
    if ((role === "CUSTOMER" || role === "COORDINATOR") && !target.membership) {
      await tx.eventMember.create({ data: { eventId, userId: id } });
    }
    await tx.user.update({ where: { id }, data: { role } });
    // Attendees have no PIN; new privileged roles must set one with a setup code.
    if (role === "CUSTOMER") await tx.user.update({ where: { id }, data: { pinHash: null } });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "person.changeRole", "User", id, { from: target.role, to: role });
  });
}

/** Owner only. Deactivation signs the person out everywhere immediately. */
export async function setPersonStatus(actor: Actor, id: string, status: AccountStatus) {
  if (!can(actor, "person.deactivate")) throw forbidden();
  if (id === actor.id) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const target = await findInEvent(tx, id, eventOf(actor));
    if (!canEditPerson(actor, target)) throw forbidden();
    if (status === "INACTIVE" && (await hasActiveTrip(tx, id))) throw conflict("personOnTrip");
    await tx.user.update({ where: { id }, data: { status } });
    if (status === "INACTIVE") {
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(tx, actor, status === "INACTIVE" ? "person.deactivate" : "person.activate", "User", id);
  });
}

/**
 * Forgotten PIN: an authorized admin removes the PIN. The person is signed out
 * everywhere and chooses a new PIN at their next sign-in.
 */
export async function resetPin(actor: Actor, id: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const target = await findInEvent(tx, id, eventOf(actor));
    if (!canResetPin(actor, target)) throw forbidden();
    await clearPin(tx, id);
    await audit(tx, actor, "person.resetPin", "User", id);
  });
}

/** Active coordinators of the current event, for dropdowns. */
export async function coordinatorOptions(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.user.findMany({
    where: { role: "COORDINATOR", status: "ACTIVE", memberships: { some: { eventId } } },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true, coordinatedHotels: { where: { eventId }, select: { name: true } } },
  });
  return rows.map(({ coordinatedHotels, ...c }) => ({ ...c, coordinatedHotel: coordinatedHotels[0] ?? null }));
}
