// Creates load-test data with ready-made sessions (OTP can't be used at scale)
// and writes the tokens k6 needs to tests/load/.tokens.json (git-ignored).
//
// SAFETY: refuses unless the database is local or its name contains
// "staging", "load" or "test". Never run against production.
//
//   npx tsx scripts/loadtest-seed.ts --attendees 2000 --hotels 10 --buses-per-hotel 2
//   npx tsx scripts/loadtest-seed.ts --cleanup
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const { values } = parseArgs({
  options: {
    attendees: { type: "string", default: "2000" },
    hotels: { type: "string", default: "10" },
    "buses-per-hotel": { type: "string", default: "2" },
    cleanup: { type: "boolean", default: false },
  },
});

const url = process.env.DATABASE_URL ?? "";
const dbName = (() => {
  try {
    return new URL(url).pathname.slice(1);
  } catch {
    return "";
  }
})();
const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
if (process.env.NODE_ENV === "production" || !(isLocal || /(staging|load|test)/i.test(dbName))) {
  console.error("Refusing: load-test data may only be created in a local, staging, load or test database.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
// Load-test accounts use the +91 77777 xxxxx range so they're easy to find and delete.
const PREFIX = "+9177777";
const LT_EVENT = "evt_loadtest";
const phone = (n: number) => `${PREFIX}${String(n).padStart(5, "0")}`;
const token = () => randomBytes(32).toString("base64url");
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const hotels = await prisma.hotel.findMany({ where: { name: { startsWith: "LT Hotel" } }, select: { id: true } });
  const hotelIds = hotels.map((h) => h.id);
  await prisma.trip.deleteMany({ where: { coordinatorId: { in: ids } } });
  await prisma.bus.deleteMany({ where: { hotelId: { in: hotelIds } } });
  await prisma.eventMember.deleteMany({ where: { eventId: LT_EVENT } });
  await prisma.session.deleteMany({ where: { eventId: LT_EVENT } });
  await prisma.hotel.deleteMany({ where: { id: { in: hotelIds } } });
  await prisma.event.deleteMany({ where: { id: LT_EVENT } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} load-test users and ${hotelIds.length} hotels.`);
}

async function seed() {
  await cleanup();
  const attendees = Number(values.attendees);
  const hotelCount = Number(values.hotels);
  const busesPerHotel = Number(values["buses-per-hotel"]);
  let n = 0;

  const out: {
    admin: string;
    customers: { token: string; busIds: string[] }[];
    coordinators: { token: string; tripId: string; busId: string }[];
  } = { admin: "", customers: [], coordinators: [] };

  await prisma.event.create({ data: { id: LT_EVENT, name: "Load test event" } });
  const sessionFor = async (userId: string) => {
    const t = token();
    await prisma.session.create({ data: { tokenHash: sha256(t), userId, eventId: LT_EVENT, expiresAt: days(2) } });
    return t;
  };

  const admin = await prisma.user.create({ data: { phone: phone(n++), name: "LT Admin", role: "ADMIN" } });
  out.admin = await sessionFor(admin.id);

  const hotelBuses: string[][] = [];
  const hotelIds: string[] = [];
  for (let h = 0; h < hotelCount; h++) {
    const hotel = await prisma.hotel.create({
      data: { eventId: LT_EVENT, name: `LT Hotel ${h + 1}`, address: "Load test", latitude: 12.97 + h * 0.01, longitude: 77.59 },
    });
    hotelIds.push(hotel.id);
    const buses: string[] = [];
    for (let b = 0; b < busesPerHotel; b++) {
      const coord = await prisma.user.create({
        data: { phone: phone(n++), name: `LT Coordinator ${h}-${b}`, role: "COORDINATOR", memberships: { create: { eventId: LT_EVENT } } },
      });
      const bus = await prisma.bus.create({ data: { label: `LT Bus ${h + 1}-${b + 1}`, hotelId: hotel.id, coordinatorId: coord.id } });
      await prisma.busStop.createMany({
        data: [1, 2, 3].map((s) => ({ busId: bus.id, sequence: s, name: `Stop ${s}`, latitude: 12.97 + s * 0.005, longitude: 77.6 })),
      });
      const trip = await prisma.trip.create({ data: { busId: bus.id, coordinatorId: coord.id, status: "TO_STOP", sharingLocation: true } });
      out.coordinators.push({ token: await sessionFor(coord.id), tripId: trip.id, busId: bus.id });
      buses.push(bus.id);
    }
    hotelBuses.push(buses);
  }

  // Attendees in batches, spread across hotels.
  const BATCH = 500;
  for (let start = 0; start < attendees; start += BATCH) {
    const size = Math.min(BATCH, attendees - start);
    const rows = Array.from({ length: size }, (_, i) => {
      const k = start + i;
      return { phone: phone(n + k), name: `LT Attendee ${k + 1}`, role: "CUSTOMER" as const, hotelId: hotelIds[k % hotelCount] };
    });
    await prisma.user.createMany({ data: rows.map((r) => ({ phone: r.phone, name: r.name, role: r.role })) });
    const created = await prisma.user.findMany({ where: { phone: { in: rows.map((r) => r.phone) } }, select: { id: true, phone: true } });
    const hotelByPhone = new Map(rows.map((r) => [r.phone, r.hotelId]));
    await prisma.eventMember.createMany({ data: created.map((u) => ({ eventId: LT_EVENT, userId: u.id, hotelId: hotelByPhone.get(u.phone)! })) });
    const sessions = created.map((u) => ({ token: token(), userId: u.id, hotelId: hotelByPhone.get(u.phone)! }));
    await prisma.session.createMany({ data: sessions.map((s) => ({ tokenHash: sha256(s.token), userId: s.userId, eventId: LT_EVENT, expiresAt: days(2) })) });
    for (const s of sessions) out.customers.push({ token: s.token, busIds: hotelBuses[hotelIds.indexOf(s.hotelId)] });
  }

  mkdirSync("tests/load", { recursive: true });
  writeFileSync("tests/load/.tokens.json", JSON.stringify(out));
  console.log(
    `Created ${attendees} attendees, ${hotelCount} hotels, ${hotelCount * busesPerHotel} buses on active trips. Tokens: tests/load/.tokens.json (git-ignored; delete after testing).`,
  );
}

(values.cleanup ? cleanup() : seed())
  .catch((err) => {
    console.error("loadtest-seed failed:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
