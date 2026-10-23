import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AttendanceMark } from "@/generated/prisma/enums";
import { canManageAttendanceSession, canViewAttendanceSession, type Actor } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { AppError, conflict, forbidden, isUniqueViolation, notFound } from "@/server/errors";
import { audit } from "./audit";
import { eventOf } from "./context";

// Dated attendance sessions, one roll-call per bus per occasion. Unlike the
// old live-only boarding list, a session is a record: it can be revisited,
// its marks edited later, and the same bus can have many sessions over the
// event (one per day, or several a day with a label). Counts are always
// computed from AttendanceRecord + the hotel's roster, never stored, so they
// can't go stale when a mark changes.

async function requireBus(eventId: string, busId: string) {
  const bus = await prisma.bus.findFirst({ where: { id: busId, hotel: { eventId } }, select: { id: true, hotelId: true, label: true } });
  if (!bus) throw notFound();
  return bus;
}

/** Sessions for one bus, newest first, each with its derived counts. */
export async function listSessions(actor: Actor, busId: string) {
  const eventId = eventOf(actor);
  const bus = await requireBus(eventId, busId);
  const scope = await loadScope(actor);
  if (!canViewAttendanceSession(actor, scope, bus)) throw notFound();

  const [sessions, rosterSize] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { busId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, date: true, label: true, createdAt: true, records: { select: { mark: true } } },
    }),
    prisma.eventMember.count({ where: { eventId, hotelId: bus.hotelId, user: { role: "CUSTOMER", status: "ACTIVE" } } }),
  ]);

  return {
    bus,
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      label: s.label,
      createdAt: s.createdAt,
      total: rosterSize,
      boarded: s.records.filter((r) => r.mark === "BOARDED").length,
      absent: s.records.filter((r) => r.mark === "ABSENT").length,
    })),
  };
}

/** Creates a new session. Rejects an accidental exact duplicate (same bus/date/label). */
export async function createSession(actor: Actor, input: { busId: string; date: Date; label: string }) {
  const eventId = eventOf(actor);
  const bus = await requireBus(eventId, input.busId);
  const scope = await loadScope(actor);
  if (!canManageAttendanceSession(actor, scope, input.busId)) throw forbidden();

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.create({
        data: { eventId, busId: input.busId, date: input.date, label: input.label, createdById: actor.id },
      });
      await audit(tx, actor, "attendance.createSession", "AttendanceSession", session.id, { busId: bus.id, date: input.date.toISOString() });
      return session;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("duplicateSession");
    throw err;
  }
}

/** One session's roster — every active guest of the bus's hotel, with their mark if recorded. */
export async function getSession(actor: Actor, sessionId: string) {
  const eventId = eventOf(actor);
  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, eventId },
    select: {
      id: true,
      date: true,
      label: true,
      bus: { select: { id: true, label: true, hotelId: true } },
      records: {
        select: { id: true, userId: true, mark: true, note: true, version: true, recordedAt: true, recordedBy: { select: { name: true } } },
      },
    },
  });
  if (!session) throw notFound();
  const scope = await loadScope(actor);
  if (!canViewAttendanceSession(actor, scope, session.bus)) throw notFound();
  const canEdit = canManageAttendanceSession(actor, scope, session.bus.id);

  const members = await prisma.eventMember.findMany({
    where: { eventId, hotelId: session.bus.hotelId, user: { role: "CUSTOMER", status: "ACTIVE" } },
    orderBy: { user: { name: "asc" } },
    select: { user: { select: { id: true, name: true, phone: true } } },
  });
  const recordByUser = new Map(session.records.map((r) => [r.userId, r]));
  const roster = members.map(({ user }) => ({ user, record: recordByUser.get(user.id) ?? null }));

  return {
    id: session.id,
    date: session.date,
    label: session.label,
    bus: session.bus,
    canEdit,
    summary: {
      total: roster.length,
      boarded: session.records.filter((r) => r.mark === "BOARDED").length,
      absent: session.records.filter((r) => r.mark === "ABSENT").length,
    },
    roster,
  };
}

/**
 * Sets (creates or updates) one guest's mark for a session. `expectedVersion`
 * is the version the caller last saw (0 for a guest with no mark yet); a
 * concurrent edit by someone else is rejected, not silently overwritten.
 */
export async function recordMark(
  actor: Actor,
  input: { sessionId: string; userId: string; mark: AttendanceMark; note: string | null; expectedVersion: number },
) {
  const eventId = eventOf(actor);
  const session = await prisma.attendanceSession.findFirst({
    where: { id: input.sessionId, eventId },
    select: { id: true, bus: { select: { id: true, hotelId: true } } },
  });
  if (!session) throw notFound();
  const scope = await loadScope(actor);
  if (!canManageAttendanceSession(actor, scope, session.bus.id)) throw forbidden();

  const member = await prisma.eventMember.findFirst({
    where: { eventId, userId: input.userId, hotelId: session.bus.hotelId, user: { role: "CUSTOMER", status: "ACTIVE" } },
    select: { userId: true },
  });
  if (!member) throw new AppError("invalid", "notAttendee");

  const existing = await prisma.attendanceRecord.findUnique({
    where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
    select: { id: true, version: true },
  });
  if ((existing?.version ?? 0) !== input.expectedVersion) throw conflict("staleAttendance");

  const version = await prisma.$transaction(async (tx) => {
    if (existing) {
      const updated = await tx.attendanceRecord.updateMany({
        where: { id: existing.id, version: input.expectedVersion },
        data: { mark: input.mark, note: input.note, recordedById: actor.id, recordedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count === 0) throw conflict("staleAttendance");
    } else {
      // A brand-new record always starts at version 0 (the column default) —
      // nothing to increment yet, so the returned version must say 0, not 1,
      // or the next edit's optimistic check would reject a legitimate update.
      await tx.attendanceRecord.create({
        data: { sessionId: input.sessionId, userId: input.userId, mark: input.mark, note: input.note, recordedById: actor.id },
      });
    }
    await audit(tx, actor, "attendance.recordMark", "AttendanceRecord", input.userId, { sessionId: input.sessionId, mark: input.mark });
    return existing ? input.expectedVersion + 1 : 0;
  });
  return { version };
}
