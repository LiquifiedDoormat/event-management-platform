import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AttendanceType } from "@/generated/prisma/enums";
import { can, canRecordBoarding, canViewPerson, isStaff, type Actor } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { AppError, forbidden, notFound } from "@/server/errors";
import { eventOf } from "./context";

// Append-only attendance/movement trail: venue check-in/out (staff at a gate)
// and bus boarding/departure (the trip's coordinator, or staff). Never
// updated or deleted — a correction is simply a new event; "current" status
// is always the latest event of each kind.

async function requireActiveAttendee(eventId: string, userId: string) {
  const member = await prisma.eventMember.findFirst({
    where: { eventId, userId, user: { role: "CUSTOMER", status: "ACTIVE" } },
    select: { hotelId: true },
  });
  if (!member) throw new AppError("invalid", "notAttendee");
  return member;
}

/** Venue check-in/out, optionally at a named gate. Staff only. */
export async function recordCheckInOut(actor: Actor, input: { userId: string; type: "CHECK_IN" | "CHECK_OUT"; gateId?: string }) {
  if (!can(actor, "attendance.checkInOut")) throw forbidden();
  const eventId = eventOf(actor);
  await requireActiveAttendee(eventId, input.userId);
  if (input.gateId) {
    const gate = await prisma.gate.findFirst({ where: { id: input.gateId, eventId }, select: { id: true } });
    if (!gate) throw notFound();
  }
  await prisma.attendanceEvent.create({
    data: { eventId, userId: input.userId, type: input.type, gateId: input.gateId ?? null, recordedById: actor.id },
  });
}

/** Boarding/departing a specific bus. The bus's own coordinator, or staff. */
export async function recordBoarding(actor: Actor, input: { userId: string; busId: string; type: "BOARD" | "DEPART" }) {
  const eventId = eventOf(actor);
  const scope = await loadScope(actor);
  if (!canRecordBoarding(actor, scope, input.busId)) throw forbidden();
  const bus = await prisma.bus.findFirst({ where: { id: input.busId, hotel: { eventId } }, select: { id: true, hotelId: true } });
  if (!bus) throw notFound();
  const attendee = await requireActiveAttendee(eventId, input.userId);
  // Loose sanity check, not a hard scope rule: buses aren't seat-assigned, but
  // flag a mismatched hotel so a coordinator doesn't record the wrong person.
  if (attendee.hotelId !== bus.hotelId) throw new AppError("invalid", "attendeeWrongHotel");
  await prisma.attendanceEvent.create({
    data: { eventId, userId: input.userId, type: input.type, busId: input.busId, recordedById: actor.id },
  });
}

type Event = { type: AttendanceType; gateId: string | null; busId: string | null; createdAt: Date; recordedBy: { name: string } | null };

function deriveStatus(events: Event[]) {
  const latestOf = (types: AttendanceType[]) => events.find((e) => types.includes(e.type)) ?? null;
  const latestCheck = latestOf(["CHECK_IN", "CHECK_OUT"]);
  const latestBoard = latestOf(["BOARD", "DEPART"]);
  return {
    checkedIn: latestCheck?.type === "CHECK_IN",
    checkedInAt: latestCheck?.type === "CHECK_IN" ? latestCheck.createdAt : null,
    boardedBusId: latestBoard?.type === "BOARD" ? latestBoard.busId : null,
    boardedAt: latestBoard?.type === "BOARD" ? latestBoard.createdAt : null,
  };
}

/** Full append-only trail for one attendee, newest first, plus the derived current status. */
export async function getAttendanceTrail(actor: Actor, userId: string) {
  const eventId = eventOf(actor);
  const member = await prisma.eventMember.findFirst({
    where: { eventId, userId, user: { role: "CUSTOMER" } },
    select: { hotelId: true },
  });
  if (!member) throw notFound();
  const scope = isStaff(actor) ? { hotelIds: new Set<string>(), operableBusIds: new Set<string>() } : await loadScope(actor);
  if (!canViewPerson(actor, scope, { id: userId, role: "CUSTOMER", hotelId: member.hotelId })) throw forbidden();

  const events = await prisma.attendanceEvent.findMany({
    where: { eventId, userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      createdAt: true,
      gateId: true,
      gate: { select: { name: true } },
      busId: true,
      bus: { select: { label: true } },
      recordedBy: { select: { name: true } },
    },
  });
  return { status: deriveStatus(events), events };
}

/**
 * Roster for one bus: every active attendee of its hotel with their current
 * boarded/departed status — the digital check-off list for a coordinator.
 */
export async function getBusManifest(actor: Actor, busId: string) {
  const eventId = eventOf(actor);
  const scope = await loadScope(actor);
  if (!canRecordBoarding(actor, scope, busId)) throw forbidden();
  const bus = await prisma.bus.findFirst({ where: { id: busId, hotel: { eventId } }, select: { id: true, label: true, hotelId: true } });
  if (!bus) throw notFound();

  const attendees = await prisma.eventMember.findMany({
    where: { eventId, hotelId: bus.hotelId, user: { role: "CUSTOMER", status: "ACTIVE" } },
    orderBy: { user: { name: "asc" } },
    select: { user: { select: { id: true, name: true, phone: true } } },
  });
  const latest = await prisma.attendanceEvent.findMany({
    where: { eventId, busId, type: { in: ["BOARD", "DEPART"] } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, type: true, createdAt: true },
  });
  const statusByUser = new Map<string, { boarded: boolean; at: Date | null }>();
  for (const e of latest) {
    if (!statusByUser.has(e.userId)) statusByUser.set(e.userId, { boarded: e.type === "BOARD", at: e.createdAt });
  }
  return {
    bus: { id: bus.id, label: bus.label },
    attendees: attendees.map(({ user }) => ({ ...user, ...(statusByUser.get(user.id) ?? { boarded: false, at: null }) })),
  };
}
