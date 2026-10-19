// Development-only demo data: two independent events. Safe to run repeatedly
// (upserts by stable keys). Refuses to run against production or any non-local
// database. Demo staff accounts get the PIN below so you can sign in locally.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import { hashPin } from "../src/lib/auth/pin";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
if (process.env.NODE_ENV === "production" || !isLocal) {
  console.error("Refusing to seed: demo data may only be loaded into a local development database.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
// Fake numbers in the +91 99999 xxxxx range. Not real people.
const fake = (n: number) => `+9199999${String(n).padStart(5, "0")}`;
const DEMO_PIN = "246810";

const EVENTS = [
  {
    id: "evt_default",
    name: "Demo Event — Bengaluru",
    city: { lat: 12.97, lng: 77.59, venue: "Event Venue – Gate 2" },
    hotels: [
      { id: "seed-hotel-1", name: "Lotus Grand", address: "MG Road, Bengaluru 560001", latitude: 12.9756, longitude: 77.605 },
      { id: "seed-hotel-2", name: "Lake View Inn", address: "Ulsoor Lake Road, Bengaluru 560008", latitude: 12.9817, longitude: 77.6193 },
    ],
    coordinatorPhones: [10, 11],
    attendeeBase: 100,
  },
  {
    id: "evt_demo_2",
    name: "Demo Event — Delhi",
    city: { lat: 28.61, lng: 77.21, venue: "Convention Centre – Hall A" },
    hotels: [
      { id: "seed-hotel-3", name: "Connaught Residency", address: "Connaught Place, New Delhi 110001", latitude: 28.6315, longitude: 77.2167 },
      { id: "seed-hotel-4", name: "Karol Bagh Suites", address: "Karol Bagh, New Delhi 110005", latitude: 28.6519, longitude: 77.1909 },
    ],
    // Coordinator 99999 00010 also works at this event (tests multi-event membership).
    coordinatorPhones: [10, 12],
    attendeeBase: 200,
  },
];

async function upsertUser(phone: string, name: string, role: Role, pinHash?: string) {
  // Demo staff always get the demo PIN (also on existing local accounts).
  return prisma.user.upsert({ where: { phone }, update: pinHash ? { pinHash } : {}, create: { phone, name, role, pinHash } });
}

async function main() {
  await prisma.eventConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const pinHash = await hashPin(DEMO_PIN);
  await upsertUser(fake(2), "Demo Admin", Role.ADMIN, pinHash);

  for (const [e, ev] of EVENTS.entries()) {
    await prisma.event.upsert({ where: { id: ev.id }, update: { name: ev.name }, create: { id: ev.id, name: ev.name } });

    for (const [i, h] of ev.hotels.entries()) {
      const coordinator = await upsertUser(fake(ev.coordinatorPhones[i]), `Coordinator ${ev.coordinatorPhones[i] - 9}`, Role.COORDINATOR, pinHash);
      await prisma.eventMember.upsert({
        where: { eventId_userId: { eventId: ev.id, userId: coordinator.id } },
        update: {},
        create: { eventId: ev.id, userId: coordinator.id },
      });
      await prisma.hotel.upsert({
        where: { id: h.id },
        update: { eventId: ev.id, coordinatorId: coordinator.id },
        create: { ...h, eventId: ev.id, coordinatorId: coordinator.id },
      });

      const busId = `seed-bus-${e * 2 + i + 1}`;
      await prisma.bus.upsert({
        where: { id: busId },
        update: {},
        create: { id: busId, label: `Bus ${i + 1}`, registration: `DEMO${e + 1}${i + 1}`, hotelId: h.id, coordinatorId: coordinator.id },
      });
      const stops = [
        { sequence: 1, name: h.name, latitude: h.latitude, longitude: h.longitude, timeNote: "Departs 8:30 AM" },
        { sequence: 2, name: ev.city.venue, latitude: ev.city.lat, longitude: ev.city.lng, timeNote: "Arrives 9:15 AM" },
      ];
      for (const s of stops) {
        await prisma.busStop.upsert({ where: { busId_sequence: { busId, sequence: s.sequence } }, update: {}, create: { busId, ...s } });
      }

      for (let a = 0; a < 5; a++) {
        const attendee = await upsertUser(fake(ev.attendeeBase + i * 10 + a), `Attendee ${e + 1}.${i + 1}-${a + 1}`, Role.CUSTOMER);
        await prisma.eventMember.upsert({
          where: { eventId_userId: { eventId: ev.id, userId: attendee.id } },
          update: { hotelId: h.id },
          create: { eventId: ev.id, userId: attendee.id, hotelId: h.id },
        });
      }
    }
  }

  console.log(
    `Seeded 2 demo events. Staff PIN for demo admin ${fake(2)} and coordinators ${fake(10)}, ${fake(11)}, ${fake(12)}: ${DEMO_PIN} (local only). Attendees: ${fake(100)}… (Bengaluru), ${fake(200)}… (Delhi).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
