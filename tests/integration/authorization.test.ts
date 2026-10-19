import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { canSendLocation, canStartTrip, canViewBus, canViewHotel, canViewPerson } from "@/server/policies";
import { loadScope } from "@/server/policies/scope";
import { getCustomerHome } from "@/server/services/transport";
import { createTwoHotels, createUser, hasTestDb, moveAttendee, resetDb } from "./helpers";

describe.skipIf(!hasTestDb)("relationship-based authorization", () => {
  beforeEach(resetDb);

  it("limits a customer to their own hotel and its buses", async () => {
    const { guestA, hotelA, hotelB, busA, busB } = await createTwoHotels();
    const scope = await loadScope(guestA);
    expect(canViewHotel(guestA, scope, hotelA.id)).toBe(true);
    expect(canViewHotel(guestA, scope, hotelB.id)).toBe(false);
    expect(canViewBus(guestA, scope, busA)).toBe(true);
    expect(canViewBus(guestA, scope, busB)).toBe(false);
  });

  it("does not let a customer view another attendee", async () => {
    const { guestA, guestB } = await createTwoHotels();
    const scope = await loadScope(guestA);
    expect(canViewPerson(guestA, scope, guestA)).toBe(true);
    expect(canViewPerson(guestA, scope, guestB)).toBe(false);
  });

  it("switches a customer's access immediately when their hotel changes", async () => {
    const { guestA, hotelA, hotelB, busB } = await createTwoHotels();
    const moved = await moveAttendee(guestA, hotelB.id);
    const scope = await loadScope(moved);
    expect(canViewHotel(moved, scope, hotelA.id)).toBe(false);
    expect(canViewHotel(moved, scope, hotelB.id)).toBe(true);
    expect(canViewBus(moved, scope, busB)).toBe(true);
    expect((await getCustomerHome({ ...moved, eventName: null })).hotel?.name).toBe("Hotel B");
  });

  it("customer overview exposes only the coordinator's name and phone", async () => {
    const { guestA, coordA } = await createTwoHotels();
    const { hotel } = await getCustomerHome({ ...guestA, eventName: null });
    expect(hotel?.coordinator).toEqual({ name: coordA.name, phone: coordA.phone });
    expect(hotel?.buses.map((b) => b.label)).toEqual(["Bus A"]);
  });

  it("lets a coordinator operate only their own buses", async () => {
    const { coordA, busA, busB, guestA, guestB } = await createTwoHotels();
    const scope = await loadScope(coordA);
    expect(canStartTrip(coordA, scope, busA.id)).toBe(true);
    expect(canStartTrip(coordA, scope, busB.id)).toBe(false);
    expect(canViewPerson(coordA, scope, guestA)).toBe(true);
    expect(canViewPerson(coordA, scope, guestB)).toBe(false);
  });

  it("accepts GPS only from the active trip's coordinator", async () => {
    const { coordA, coordB, busA, guestA } = await createTwoHotels();
    const trip = await prisma.trip.create({ data: { busId: busA.id, coordinatorId: coordA.id } });
    expect(canSendLocation(coordA, trip)).toBe(true);
    expect(canSendLocation(coordB, trip)).toBe(false);
    expect(canSendLocation(guestA, trip)).toBe(false);
    const ended = await prisma.trip.update({ where: { id: trip.id }, data: { endedAt: new Date() } });
    expect(canSendLocation(coordA, ended)).toBe(false);
  });

  it("gives staff an event-wide view", async () => {
    const { hotelB, busB, guestB } = await createTwoHotels();
    const admin = await createUser("ADMIN");
    const scope = await loadScope(admin);
    expect(canViewHotel(admin, scope, hotelB.id)).toBe(true);
    expect(canViewBus(admin, scope, busB)).toBe(true);
    expect(canViewPerson(admin, scope, guestB)).toBe(true);
  });
});
