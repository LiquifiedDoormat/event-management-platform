import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AccountStatus, Prisma, Role } from "@/generated/prisma/client";
import type { PersonCreateInput, PersonUpdateInput } from "@/lib/validation/entities";
import {
  assignableRoles,
  can,
  canEditMedicalNeeds,
  canEditPerson,
  canResetPin,
  canSetAttendeeHotel,
  canViewAddress,
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
const PRIVILEGED: Role[] = ["OWNER", "ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR"];
/** Roles that take part in an event through an EventMember row. */
const MEMBER_ROLES: Role[] = ["CUSTOMER", "COORDINATOR", "CLUSTER_COORDINATOR"];

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
    // An attendee's or hotel coordinator's hotel, or a cluster coordinator's
    // cluster, in this event — same membership row either way.
    memberships: {
      where: { eventId },
      select: { hotel: { select: { id: true, name: true } }, cluster: { select: { id: true, name: true } }, zone: { select: { id: true, name: true } } },
    },
    designatedBuses: { where: { isActive: true, hotel: { eventId } }, select: { id: true, label: true } },
    // List views show only whether medical needs are on file, not the text
    // itself — the full note stays on the person detail page, gated to
    // whoever canEditMedicalNeeds allows (see getPerson).
    medicalNeeds: true,
  }) satisfies Prisma.UserSelect;

/** Strips the raw medical-needs text from a list row down to a yes/no tag. */
const tagMedicalNeeds = <T extends { medicalNeeds: string | null }>({ medicalNeeds, ...rest }: T) => ({
  ...rest,
  hasMedicalNeeds: Boolean(medicalNeeds),
});

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

const shape = <
  T extends {
    memberships: {
      hotel: { id: string; name: string } | null;
      cluster: { id: string; name: string } | null;
      zone?: { id: string; name: string } | null;
      room?: { id: string; label: string } | null;
    }[];
  },
>(
  p: T,
) => {
  const { memberships, ...rest } = p;
  return {
    ...rest,
    hotel: memberships[0]?.hotel ?? null,
    cluster: memberships[0]?.cluster ?? null,
    zone: memberships[0]?.zone ?? null,
    room: memberships[0]?.room ?? null,
  };
};

/** Directory of the current event: search by name, phone digits or exact id. Staff only. */
export async function listPeople(
  actor: Actor,
  opts: { q?: string; cursor?: string; role?: Role | Role[]; status?: AccountStatus; hotelId?: string; hasMedicalNeeds?: true },
) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        inEvent(eventId),
        searchWhere(opts.q),
        opts.role ? { role: Array.isArray(opts.role) ? { in: opts.role } : opts.role } : {},
        opts.status ? { status: opts.status } : {},
        opts.hotelId ? { memberships: { some: { eventId, hotelId: opts.hotelId } } } : {},
        opts.hasMedicalNeeds ? { medicalNeeds: { not: null } } : {},
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: listSelect(eventId),
  });
  const page = toPage(rows);
  return { ...page, items: page.items.map((p) => tagMedicalNeeds(shape(p))) };
}

/**
 * Full attendee export for CSV download — every active attendee in the
 * event, unpaginated, including the postal address (PII; this is why the
 * route calling this is staff-only, same gate as `dashboard.viewAll`).
 */
export async function exportAttendees(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.user.findMany({
    where: { role: "CUSTOMER", status: "ACTIVE", memberships: { some: { eventId } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      name: true,
      phone: true,
      address: true,
      gender: true,
      memberships: {
        where: { eventId },
        select: { hotel: { select: { name: true } }, zone: { select: { name: true } } },
      },
    },
  });
  return rows.map((r) => ({
    name: r.name,
    phone: r.phone,
    hotel: r.memberships[0]?.hotel?.name ?? "",
    zone: r.memberships[0]?.zone?.name ?? "",
    gender: r.gender ?? "",
    address: r.address ?? "",
  }));
}

/**
 * Other guests registered with the same phone number, in the same event (e.g.
 * a family travelling together) — so a signed-in guest can see who else is
 * linked to their number, per the brief. Deliberately minimal: name and hotel
 * only, never medical needs, address, or any other guest's phone number, and
 * scoped strictly to the current event so a shared number never surfaces an
 * unrelated registration from another event.
 */
export async function getLinkedGuests(actor: Actor, phone: string) {
  if (actor.role !== "CUSTOMER") throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.user.findMany({
    where: { phone, role: "CUSTOMER", status: "ACTIVE", id: { not: actor.id }, memberships: { some: { eventId } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, memberships: { where: { eventId }, select: { hotel: { select: { id: true, name: true } } } } },
  });
  return rows.map(({ memberships, ...r }) => ({ ...r, hotel: memberships[0]?.hotel ?? null }));
}

/**
 * Coordinator's attendee list: active attendees of the hotels the coordinator
 * is responsible for in the current event. Filtering is done in the database.
 */
export async function listMyAttendees(actor: Actor, opts: { q?: string; cursor?: string; hasMedicalNeeds?: true }) {
  if (actor.role !== "COORDINATOR") throw forbidden();
  const eventId = eventOf(actor);
  const hotelIds = [...(await loadScope(actor)).hotelIds];
  if (hotelIds.length === 0) return { items: [], nextCursor: null };
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        { role: "CUSTOMER", status: "ACTIVE", memberships: { some: { eventId, hotelId: { in: hotelIds } } } },
        searchWhere(opts.q),
        opts.hasMedicalNeeds ? { medicalNeeds: { not: null } } : {},
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      name: true,
      phone: true,
      medicalNeeds: true,
      memberships: { where: { eventId }, select: { hotel: { select: { id: true, name: true } }, zone: { select: { id: true, name: true } } } },
    },
  });
  const page = toPage(rows);
  return {
    ...page,
    items: page.items.map(({ memberships, ...p }) =>
      tagMedicalNeeds({ ...p, hotel: memberships[0]?.hotel ?? null, zone: memberships[0]?.zone ?? null }),
    ),
  };
}

export async function getPerson(actor: Actor, id: string) {
  const eventId = eventOf(actor);
  const person = await prisma.user.findFirst({
    where: { id, ...inEvent(eventId) },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      medicalNeeds: true,
      gender: true,
      role: true,
      status: true,
      preferredLocale: true,
      createdAt: true,
      updatedAt: true,
      pinHash: true,
      pinLockedUntil: true,
      memberships: {
        where: { eventId },
        select: {
          hotel: { select: { id: true, name: true } },
          cluster: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true, gates: { orderBy: { name: "asc" }, select: { id: true, name: true } } } },
          room: { select: { id: true, label: true } },
        },
      },
      designatedBuses: { where: { hotel: { eventId } }, select: { id: true, label: true, isActive: true }, orderBy: { label: "asc" } },
      trips: {
        where: { endedAt: null, bus: { hotel: { eventId } } },
        select: { id: true, status: true, bus: { select: { id: true, label: true } } },
      },
    },
  });
  if (!person) throw notFound();
  const { pinHash, pinLockedUntil, address, medicalNeeds, ...rest } = shape(person);
  // `shape`'s generic zone type is the common {id,name} shared with list views;
  // only here do we also need each gate's name, so take it straight off the
  // untouched membership row rather than widening `shape` for every caller.
  const zone = person.memberships[0]?.zone ?? null;
  const result = {
    ...rest,
    zone,
    // PII, more sensitive than name/phone: never sent to the client at all
    // unless the viewer is allowed to see it, not just hidden in the UI.
    address: canViewAddress(actor, person.id) ? address : undefined,
    hotelId: rest.hotel?.id ?? null,
    zoneId: zone?.id ?? null,
    roomId: rest.room?.id ?? null,
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
  const canSeeMedicalNeeds = canEditMedicalNeeds(actor, scope, result);
  return { ...result, medicalNeeds: canSeeMedicalNeeds ? medicalNeeds : undefined, canEditMedicalNeeds: canSeeMedicalNeeds };
}

/** Updates a guest's medical-needs note. Staff, the guest, or their hotel coordinator. */
export async function updateMedicalNeeds(actor: Actor, id: string, medicalNeeds: string | undefined) {
  const eventId = eventOf(actor);
  const person = await findInEvent(prisma, id, eventId);
  if (person.role !== "CUSTOMER") throw forbidden();
  const scope = isStaff(actor) ? { hotelIds: new Set<string>(), operableBusIds: new Set<string>() } : await loadScope(actor);
  if (!canEditMedicalNeeds(actor, scope, { id: person.id, role: person.role, hotelId: person.membership?.hotelId ?? null })) throw forbidden();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { medicalNeeds: medicalNeeds ?? null } });
    await audit(tx, actor, "person.updateMedicalNeeds", "User", id, {});
  });
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
  const member = MEMBER_ROLES.includes(input.role);

  return prisma.$transaction(async (tx) => {
    if (hotelId) await requireActiveHotel(tx, hotelId, eventId);
    // A phone number is no longer a unique identity on its own: for CUSTOMER
    // accounts, several different guests (e.g. a family) may share one. The
    // real identity check is phone + name together, not phone alone. Staff
    // and coordinator roles keep the old, stricter rule (phone alone is the
    // identity) — their PIN sign-in has no "choose who you are" step.
    const candidates = await tx.user.findMany({
      where: { phone: input.phone },
      select: { id: true, name: true, role: true, memberships: { where: { eventId }, select: { id: true } } },
    });
    const sameIdentity = candidates.find(
      (c) => c.role === input.role && (input.role !== "CUSTOMER" || c.name.trim().toLowerCase() === input.name.trim().toLowerCase()),
    );
    if (sameIdentity) {
      // Same person joining another event: add a membership, keep their account.
      if (!member || sameIdentity.memberships.length > 0) throw conflict("duplicatePhone");
      await tx.eventMember.create({ data: { eventId, userId: sameIdentity.id, hotelId } });
      await audit(tx, actor, "person.addToEvent", "User", sameIdentity.id, { eventId, hotelId });
      return { id: sameIdentity.id, addedExisting: true };
    }
    if (input.role !== "CUSTOMER" && candidates.length > 0) throw conflict("duplicatePhone");
    const user = await tx.user.create({
      data: {
        name: input.name,
        phone: input.phone,
        role: input.role,
        address: input.role === "CUSTOMER" ? (input.address ?? null) : null,
        medicalNeeds: input.role === "CUSTOMER" ? (input.medicalNeeds ?? null) : null,
        gender: input.role === "CUSTOMER" ? (input.gender ?? null) : null,
        ...(member ? { memberships: { create: { eventId, hotelId } } } : {}),
      },
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
      const phoneChanged = target.phone !== input.phone;
      // Phone is no longer unique in the database (CUSTOMER accounts may
      // share one), so a staff/coordinator phone change needs its own check:
      // their role still keeps phone as a one-identity key at the app level.
      if (phoneChanged && target.role !== "CUSTOMER") {
        const clash = await tx.user.findFirst({ where: { phone: input.phone, id: { not: id } }, select: { id: true } });
        if (clash) throw conflict("duplicatePhone");
      }
      await tx.user.update({ where: { id }, data: { name: input.name, phone: input.phone, address: input.address ?? null, gender: input.gender ?? null } });
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
 * Owner only. Leaving a membership role (coordinator, cluster coordinator or
 * attendee) clears their hotel/cluster assignment (all events) and, for a
 * coordinator, their bus designations. Becoming one registers the person for
 * the current event.
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
      await tx.bus.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
    }
    if (MEMBER_ROLES.includes(target.role)) {
      await tx.eventMember.updateMany({ where: { userId: id }, data: { hotelId: null, clusterId: null } });
    }
    if (MEMBER_ROLES.includes(role) && !target.membership) {
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
    select: { id: true, name: true, memberships: { where: { eventId }, select: { hotel: { select: { name: true } } } } },
  });
  return rows.map(({ memberships, ...c }) => ({ ...c, coordinatedHotel: memberships[0]?.hotel ?? null }));
}

/** Active cluster coordinators of the current event, for dropdowns. */
export async function clusterCoordinatorOptions(actor: Actor) {
  if (!can(actor, "dashboard.viewAll")) throw forbidden();
  const eventId = eventOf(actor);
  const rows = await prisma.user.findMany({
    where: { role: "CLUSTER_COORDINATOR", status: "ACTIVE", memberships: { some: { eventId } } },
    orderBy: { name: "asc" },
    take: OPTIONS_LIMIT,
    select: { id: true, name: true, memberships: { where: { eventId }, select: { cluster: { select: { name: true } } } } },
  });
  return rows.map(({ memberships, ...c }) => ({ ...c, coordinatedCluster: memberships[0]?.cluster ?? null }));
}
