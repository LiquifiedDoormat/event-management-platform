import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/generated/prisma/client";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "LocationPoint", "BusLocation", "BusStatusEvent", "Trip", "BusStop", "Bus", "EventMember",
             "Session", "AuditLog", "RateLimitBucket", "User", "Hotel", "Event", "EventConfig" CASCADE`);
}

let n = 0;
/** Unique valid Indian mobile number per call. */
export const nextPhone = () => `+9198${String(10_000_000 + ++n).slice(-8)}`;

export function createEvent(name = `Event ${++n}`, data: { isActive?: boolean; attendeeCodeHash?: string } = {}) {
  return prisma.event.create({ data: { name, ...data } });
}

let defaultEventId: string | null = null;
/** The event tests use unless they pass one (created on demand after each reset). */
export async function defaultEvent() {
  if (defaultEventId && (await prisma.event.count({ where: { id: defaultEventId } }))) return defaultEventId;
  defaultEventId = (await createEvent("Default test event")).id;
  return defaultEventId;
}

/**
 * Creates an account. Attendees and coordinators are registered for `eventId`
 * (default test event). The returned object doubles as a session actor: it
 * carries the event and, for attendees, their hotel — like a real session.
 */
export async function createUser(
  role: Role,
  data: { hotelId?: string; status?: "ACTIVE" | "INACTIVE"; eventId?: string; pinHash?: string } = {},
) {
  const eventId = data.eventId ?? (await defaultEvent());
  const member = role === "CUSTOMER" || role === "COORDINATOR";
  const user = await prisma.user.create({
    data: {
      phone: nextPhone(),
      name: `${role} ${n}`,
      role,
      status: data.status,
      pinHash: data.pinHash,
      ...(member ? { memberships: { create: { eventId, hotelId: data.hotelId ?? null } } } : {}),
    },
  });
  return { ...user, eventId, hotelId: role === "CUSTOMER" ? (data.hotelId ?? null) : null };
}

/** Two hotels in one event, each with a coordinator, a bus and one attendee. */
export async function createTwoHotels(eventId?: string) {
  const ev = eventId ?? (await defaultEvent());
  const coordA = await createUser("COORDINATOR", { eventId: ev });
  const coordB = await createUser("COORDINATOR", { eventId: ev });
  const hotelA = await prisma.hotel.create({ data: { eventId: ev, name: "Hotel A", address: "A St", coordinatorId: coordA.id } });
  const hotelB = await prisma.hotel.create({ data: { eventId: ev, name: "Hotel B", address: "B St", coordinatorId: coordB.id } });
  const busA = await prisma.bus.create({ data: { label: "Bus A", hotelId: hotelA.id, coordinatorId: coordA.id } });
  const busB = await prisma.bus.create({ data: { label: "Bus B", hotelId: hotelB.id, coordinatorId: coordB.id } });
  const guestA = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId: ev });
  const guestB = await createUser("CUSTOMER", { hotelId: hotelB.id, eventId: ev });
  return { eventId: ev, coordA, coordB, hotelA, hotelB, busA, busB, guestA, guestB };
}

/** Moves an attendee to another hotel in the event (as the Owner would) and returns the updated actor. */
export async function moveAttendee<T extends { id: string; eventId: string }>(user: T, hotelId: string | null) {
  await prisma.eventMember.update({ where: { eventId_userId: { eventId: user.eventId, userId: user.id } }, data: { hotelId } });
  return { ...user, hotelId };
}

/** Staff actor working in `eventId` (default test event). */
export async function staff(role: "OWNER" | "ADMIN" = "ADMIN", eventId?: string) {
  const user = await createUser(role);
  return { ...user, eventId: eventId ?? (await defaultEvent()) };
}
