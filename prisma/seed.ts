// Development-only demo data. Safe to run repeatedly (upserts by stable keys).
// Refuses to run against production or any non-local database.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
if (process.env.NODE_ENV === "production" || !isLocal) {
  console.error("Refusing to seed: demo data may only be loaded into a local development database.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// Fake numbers in the +91 99999 0xxxx range. Not real people.
const fake = (n: number) => `+9199999${String(n).padStart(5, "0")}`;

async function main() {
  await prisma.eventConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1, eventName: "Demo Event 2026" } });

  const admin = await upsertUser(fake(2), "Demo Admin", Role.ADMIN);

  const hotels = [
    { id: "seed-hotel-1", name: "Lotus Grand", address: "MG Road, Bengaluru 560001", latitude: 12.9756, longitude: 77.6050 },
    { id: "seed-hotel-2", name: "Lake View Inn", address: "Ulsoor Lake Road, Bengaluru 560008", latitude: 12.9817, longitude: 77.6193 },
  ];

  for (const [i, h] of hotels.entries()) {
    const coordinator = await upsertUser(fake(10 + i), `Coordinator ${i + 1}`, Role.COORDINATOR);
    await prisma.hotel.upsert({
      where: { id: h.id },
      update: { coordinatorId: coordinator.id },
      create: { ...h, coordinatorId: coordinator.id },
    });

    const busId = `seed-bus-${i + 1}`;
    await prisma.bus.upsert({
      where: { id: busId },
      update: {},
      create: { id: busId, label: `Bus ${i + 1}`, registration: `KA01DEMO${i + 1}`, hotelId: h.id, coordinatorId: coordinator.id },
    });
    const stops = [
      { sequence: 1, name: h.name, latitude: h.latitude, longitude: h.longitude, timeNote: "Departs 8:30 AM" },
      { sequence: 2, name: "Event Venue – Gate 2", latitude: 12.9716, longitude: 77.5946, timeNote: "Arrives 9:15 AM" },
    ];
    for (const s of stops) {
      await prisma.busStop.upsert({
        where: { busId_sequence: { busId, sequence: s.sequence } },
        update: {},
        create: { busId, ...s },
      });
    }

    for (let a = 0; a < 5; a++) {
      const attendee = await upsertUser(fake(100 + i * 10 + a), `Attendee ${i + 1}-${a + 1}`, Role.CUSTOMER);
      await prisma.user.update({ where: { id: attendee.id }, data: { hotelId: h.id } });
    }
  }

  console.log(`Seeded demo data. Demo admin phone: ${admin.phone}`);
}

function upsertUser(phone: string, name: string, role: Role) {
  return prisma.user.upsert({ where: { phone }, update: {}, create: { phone, name, role } });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
