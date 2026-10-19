import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/server/errors";
import { getCustomerHome, getTrackedBus } from "@/server/services/transport";
import { createTwoHotels, createUser, hasTestDb, moveAttendee, resetDb, staff } from "./helpers";

async function denied(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe("not_found");
}

const asSession = <T extends { status: string }>(u: T) => ({ ...u, status: "ACTIVE" as const, eventName: null });

describe.skipIf(!hasTestDb)("attendee transport views", () => {
  beforeEach(resetDb);

  it("shows an attendee their own bus with trip, location and stops", async () => {
    const { guestA, busA, coordA } = await createTwoHotels();
    await prisma.busStop.create({ data: { busId: busA.id, sequence: 1, name: "Gate 2", latitude: 12.97, longitude: 77.59 } });
    const trip = await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id, status: "TO_STOP", sharingLocation: true } });
    await prisma.busLocation.create({
      data: { busId: busA.id, tripId: trip.id, latitude: 12.98, longitude: 77.6, recordedAt: new Date() },
    });

    const { bus, settings } = await getTrackedBus(guestA, busA.id);
    expect(bus.trips[0]).toMatchObject({ status: "TO_STOP", coordinator: { name: coordA.name, phone: coordA.phone } });
    expect(bus.location?.latitude).toBe(12.98);
    expect(bus.stops.map((s) => s.name)).toEqual(["Gate 2"]);
    expect(settings.staleLocationSeconds).toBe(120);
  });

  it("hides other hotels' buses from attendees, even by direct ID", async () => {
    const { guestA, busB } = await createTwoHotels();
    await denied(getTrackedBus(guestA, busB.id));
    await denied(getTrackedBus(guestA, "does-not-exist"));
  });

  it("follows a hotel reassignment immediately", async () => {
    const { guestA, busA, busB, hotelB } = await createTwoHotels();
    const moved = await moveAttendee(guestA, hotelB.id);
    await denied(getTrackedBus(moved, busA.id));
    expect((await getTrackedBus(moved, busB.id)).bus.id).toBe(busB.id);
  });

  it("hides deactivated buses from attendees but not from staff", async () => {
    const { guestA, busA } = await createTwoHotels();
    await prisma.bus.update({ where: { id: busA.id }, data: { isActive: false } });
    await denied(getTrackedBus(guestA, busA.id));
    const admin = await staff();
    expect((await getTrackedBus(admin, busA.id)).bus.isActive).toBe(false);
    expect((await getCustomerHome(asSession(guestA))).hotel?.buses).toEqual([]);
  });

  it("lets a coordinator view buses of hotels in their scope only", async () => {
    const { coordA, busA, busB } = await createTwoHotels();
    expect((await getTrackedBus(coordA, busA.id)).bus.id).toBe(busA.id);
    await denied(getTrackedBus(coordA, busB.id));
  });

  it("customer home omits an inactive coordinator and handles no hotel", async () => {
    const { guestA, coordA } = await createTwoHotels();
    await prisma.user.update({ where: { id: coordA.id }, data: { status: "INACTIVE" } });
    expect((await getCustomerHome(asSession(guestA))).hotel?.coordinator).toBeNull();
    const unassigned = await createUser("CUSTOMER");
    expect((await getCustomerHome(asSession(unassigned))).hotel).toBeNull();
  });

  it("reports the active trip's status on the customer home", async () => {
    const { guestA, busA, coordA } = await createTwoHotels();
    await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id, status: "BOARDING" } });
    const home = await getCustomerHome(asSession(guestA));
    expect(home.hotel?.buses[0].trips[0].status).toBe("BOARDING");
  });
});
