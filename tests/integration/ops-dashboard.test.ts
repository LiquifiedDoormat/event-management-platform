import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/server/errors";
import { getOpsDashboard } from "@/server/services/dashboard";
import { createEvent, createTwoHotels, hasTestDb, resetDb, staff } from "./helpers";

async function forbiddenErr(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe("forbidden");
}

describe.skipIf(!hasTestDb)("ops dashboard", () => {
  beforeEach(resetDb);

  it("refuses non-staff actors", async () => {
    const { guestA } = await createTwoHotels();
    await forbiddenErr(getOpsDashboard(guestA));
  });

  it("summarizes the whole fleet regardless of filters, and lists only filtered buses", async () => {
    const { eventId, coordA, busA, busB, hotelA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id, status: "DEPARTED_VENUE", isDelayed: true } });
    // busB has no active trip -> notRunning.
    const admin = await staff("ADMIN", eventId);

    const all = await getOpsDashboard(admin);
    expect(all.summary).toMatchObject({ moving: 1, notRunning: 1, delayed: 1, total: 2 });
    expect(all.buses).toHaveLength(2);

    const movingOnly = await getOpsDashboard(admin, { statusKind: "moving" });
    expect(movingOnly.summary.total).toBe(2); // summary always reflects the whole fleet
    expect(movingOnly.buses.map((b) => b.id)).toEqual([busA.id]);

    const delayedOnly = await getOpsDashboard(admin, { delayedOnly: true });
    expect(delayedOnly.buses.map((b) => b.id)).toEqual([busA.id]);

    const byHotel = await getOpsDashboard(admin, { hotelId: hotelA.id });
    expect(byHotel.buses.map((b) => b.id)).toEqual([busA.id]);
  });

  it("excludes inactive buses and buses outside the actor's event", async () => {
    const { eventId, busA } = await createTwoHotels();
    await prisma.bus.update({ where: { id: busA.id }, data: { isActive: false } });
    const admin = await staff("ADMIN", eventId);
    const { buses } = await getOpsDashboard(admin);
    expect(buses).toHaveLength(1);

    const otherEvent = await createEvent();
    await createTwoHotels(otherEvent.id);
    const otherAdmin = await staff("ADMIN", otherEvent.id);
    expect((await getOpsDashboard(otherAdmin)).buses).toHaveLength(2);
  });
});
