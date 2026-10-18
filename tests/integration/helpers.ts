import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/generated/prisma/client";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "LocationPoint", "BusLocation", "BusStatusEvent", "Trip", "BusStop", "Bus",
             "Session", "AuditLog", "RateLimitBucket", "User", "Hotel", "EventConfig" CASCADE`);
}

let n = 0;
/** Unique valid Indian mobile number per call. */
export const nextPhone = () => `+9198${String(10_000_000 + ++n).slice(-8)}`;

export function createUser(role: Role, data: { hotelId?: string; status?: "ACTIVE" | "INACTIVE" } = {}) {
  return prisma.user.create({ data: { phone: nextPhone(), name: `${role} ${n}`, role, ...data } });
}

/** Two hotels, each with a coordinator, a bus and one attendee. */
export async function createTwoHotels() {
  const coordA = await createUser("COORDINATOR");
  const coordB = await createUser("COORDINATOR");
  const hotelA = await prisma.hotel.create({ data: { name: "Hotel A", address: "A St", coordinatorId: coordA.id } });
  const hotelB = await prisma.hotel.create({ data: { name: "Hotel B", address: "B St", coordinatorId: coordB.id } });
  const busA = await prisma.bus.create({ data: { label: "Bus A", hotelId: hotelA.id, coordinatorId: coordA.id } });
  const busB = await prisma.bus.create({ data: { label: "Bus B", hotelId: hotelB.id, coordinatorId: coordB.id } });
  const guestA = await createUser("CUSTOMER", { hotelId: hotelA.id });
  const guestB = await createUser("CUSTOMER", { hotelId: hotelB.id });
  return { coordA, coordB, hotelA, hotelB, busA, busB, guestA, guestB };
}
