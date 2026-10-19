import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { setSessionEvent } from "@/lib/auth/session";
import { can, isStaff, type Actor } from "@/server/policies";
import { forbidden, notFound } from "@/server/errors";
import { audit } from "./audit";
import { canAccessEvent, hashAttendeeCode } from "./auth";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const date = z.preprocess(emptyToUndefined, z.coerce.date({ error: "invalid" }).optional());

export const eventInput = z
  .object({
    name: z.string().trim().min(1, "required").max(120, "tooLong"),
    startsOn: date,
    endsOn: date,
    /** "keep" (unchanged), "clear", or a new code to set. */
    attendeeCode: z.preprocess(emptyToUndefined, z.string().trim().min(4, "tooShort").max(40, "tooLong").optional()),
    clearAttendeeCode: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { message: "endBeforeStart", path: ["endsOn"] });
export type EventInput = z.infer<typeof eventInput>;

/** Active events for the sign-in dropdown (public: names only). */
export function loginEvents() {
  return prisma.event.findMany({ where: { isActive: true }, orderBy: [{ startsOn: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

/** Events the actor may switch to: staff → all; others → their active memberships. */
export function switchableEvents(actor: Actor) {
  return prisma.event.findMany({
    where: isStaff(actor) ? {} : { isActive: true, members: { some: { userId: actor.id } } },
    orderBy: [{ isActive: "desc" }, { startsOn: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true },
  });
}

export async function listEvents(actor: Actor) {
  if (!can(actor, "event.update")) throw forbidden();
  return prisma.event.findMany({
    orderBy: [{ isActive: "desc" }, { startsOn: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      isActive: true,
      attendeeCodeHash: true,
      _count: { select: { hotels: true, members: true } },
    },
  });
}

export async function getEvent(actor: Actor, id: string) {
  if (!can(actor, "event.update")) throw forbidden();
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, name: true, startsOn: true, endsOn: true, isActive: true, attendeeCodeHash: true, updatedAt: true },
  });
  if (!event) throw notFound();
  return event;
}

function data(input: EventInput) {
  return {
    name: input.name,
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    ...(input.clearAttendeeCode ? { attendeeCodeHash: null } : input.attendeeCode ? { attendeeCodeHash: hashAttendeeCode(input.attendeeCode) } : {}),
  };
}

export async function createEvent(actor: Actor, input: EventInput) {
  if (!can(actor, "event.create")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({ data: data(input), select: { id: true } });
    await audit(tx, actor, "event.create", "Event", event.id, { name: input.name });
    return event;
  });
}

export async function updateEvent(actor: Actor, id: string, input: EventInput) {
  if (!can(actor, "event.update")) throw forbidden();
  await prisma.$transaction(async (tx) => {
    if (!(await tx.event.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    await tx.event.update({ where: { id }, data: data(input) });
    await audit(tx, actor, "event.update", "Event", id, {
      fields: ["name", "dates"],
      attendeeCode: input.clearAttendeeCode ? "cleared" : input.attendeeCode ? "changed" : "unchanged",
    });
  });
}

/** Owner only. Deactivating hides an event from sign-in; nothing is deleted. */
export async function setEventActive(actor: Actor, id: string, isActive: boolean) {
  if (!can(actor, "event.deactivate")) throw forbidden();
  await prisma.$transaction(async (tx) => {
    if (!(await tx.event.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    await tx.event.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? "event.activate" : "event.deactivate", "Event", id);
  });
}

/**
 * Server-authorized context switch: the session's event changes only if the
 * user may access the target event. Permissions and memberships never change.
 */
export async function switchEvent(actor: Actor, sessionId: string, eventId: string) {
  if (!(await canAccessEvent(actor, eventId))) throw notFound();
  await setSessionEvent(sessionId, eventId);
}
