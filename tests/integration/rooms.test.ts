import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { roomInput } from "@/lib/validation/entities";
import { AppError } from "@/server/errors";
import * as rooms from "@/server/services/rooms";
import { createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function expectError(promise: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

describe.skipIf(!hasTestDb)("room service", () => {
  beforeEach(resetDb);

  it("lets admins add rooms and lists them with live occupancy", async () => {
    const admin = await staff("ADMIN");
    const { hotelA, guestA } = await createTwoHotels();
    const { id: roomId } = await rooms.createRoom(admin, hotelA.id, roomInput.parse({ label: "101", capacity: "2" }));
    expect(await rooms.listRooms(admin, hotelA.id)).toMatchObject([{ label: "101", capacity: 2, occupied: 0 }]);

    await rooms.setPersonRoom(admin, guestA.id, roomId);
    expect(await rooms.listRooms(admin, hotelA.id)).toMatchObject([{ label: "101", occupied: 1 }]);
  });

  it("refuses a duplicate room label within the same hotel, but allows it in a different hotel", async () => {
    const admin = await staff("ADMIN");
    const { hotelA, hotelB } = await createTwoHotels();
    await rooms.createRoom(admin, hotelA.id, roomInput.parse({ label: "101", capacity: "2" }));
    await expectError(rooms.createRoom(admin, hotelA.id, roomInput.parse({ label: "101", capacity: "3" })), "conflict", "duplicateRoomLabel");
    await expect(rooms.createRoom(admin, hotelB.id, roomInput.parse({ label: "101", capacity: "2" }))).resolves.toBeTruthy();
  });

  it("refuses a single assignment that would exceed the room's capacity, but allows re-assigning the current occupant", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    const g1 = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const g2 = await createUser("CUSTOMER", { hotelId: hotelA.id, eventId });
    const { id: roomId } = await rooms.createRoom(admin, hotelA.id, roomInput.parse({ label: "Single", capacity: "1" }));
    await rooms.setPersonRoom(admin, g1.id, roomId);
    await expectError(rooms.setPersonRoom(admin, g2.id, roomId), "conflict", "roomFull");
    await rooms.setPersonRoom(admin, g1.id, roomId); // no-op, already there
    expect((await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: g1.id } } }))?.roomId).toBe(roomId);
  });

  it("refuses to assign a guest to a room at a different hotel than their own", async () => {
    const admin = await staff("ADMIN");
    const { hotelB, guestA } = await createTwoHotels();
    const { id: roomId } = await rooms.createRoom(admin, hotelB.id, roomInput.parse({ label: "201", capacity: "2" }));
    // guestA belongs to hotelA, not hotelB -- their membership has no room at hotelB's inventory.
    // setPersonRoom locks by the guest's own hotelId, so this room (wrong hotel) is simply not found.
    await expectError(rooms.setPersonRoom(admin, guestA.id, roomId), "not_found");
  });

  it("refuses to deactivate a room with active guests still assigned", async () => {
    const admin = await staff("ADMIN");
    const { hotelA, guestA } = await createTwoHotels();
    const { id: roomId } = await rooms.createRoom(admin, hotelA.id, roomInput.parse({ label: "101", capacity: "2" }));
    await rooms.setPersonRoom(admin, guestA.id, roomId);
    await expectError(rooms.setRoomActive(admin, roomId, false), "conflict", "roomInUse");
    await rooms.setPersonRoom(admin, guestA.id, null);
    await rooms.setRoomActive(admin, roomId, false); // now succeeds
  });

  it("handles concurrent single assignments to a nearly-full room without exceeding capacity", async () => {
    const admin = await staff("ADMIN");
    const { eventId, hotelA } = await createTwoHotels();
    const guests = await Promise.all(Array.from({ length: 5 }, () => createUser("CUSTOMER", { hotelId: hotelA.id, eventId })));
    const { id: roomId } = await rooms.createRoom(admin, hotelA.id, roomInput.parse({ label: "Race", capacity: "3" }));
    const results = await Promise.allSettled(guests.map((g) => rooms.setPersonRoom(admin, g.id, roomId)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await prisma.eventMember.count({ where: { eventId, roomId } })).toBe(3);
  });

  it("denies coordinators and customers from managing rooms", async () => {
    const { coordA, guestA, hotelA } = await createTwoHotels();
    await expectError(rooms.createRoom(coordA, hotelA.id, roomInput.parse({ label: "101", capacity: "2" })), "forbidden");
    await expectError(rooms.listRooms(guestA, hotelA.id), "forbidden");
  });
});
