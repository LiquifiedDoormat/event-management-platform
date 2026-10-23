import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { hashPin } from "@/lib/auth/pin";
import { revokeAllSessions, validateSession } from "@/lib/auth/session";
import { clearPin, loginAttendee, loginWithPin, logout, pinStatus, setupPin } from "@/server/services/auth";
import { createEvent, createTwoHotels, createUser, defaultEvent, hasTestDb, resetDb } from "./helpers";

const ip = "203.0.113.7";
const PIN = "482915";
let pinHash: string;

async function resetPinOf(userId: string) {
  await prisma.$transaction((tx) => clearPin(tx, userId));
}

describe.skipIf(!hasTestDb)("PIN sign-in for Owner, Admin and Coordinator", () => {
  beforeEach(async () => {
    await resetDb();
    pinHash ??= await hashPin(PIN);
  });

  it("signs in with phone + PIN into the chosen event; the session persists and carries the event", async () => {
    const eventId = await defaultEvent();
    const coord = await createUser("COORDINATOR", { pinHash });
    const result = await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip });
    expect(result.status).toBe("ok");
    const session = await validateSession(result.status === "ok" ? result.token : "");
    expect(session?.user).toMatchObject({ id: coord.id, eventId, role: "COORDINATOR" });
    // Same token later (browser restart) still works; only the hash is stored.
    expect((await validateSession(result.status === "ok" ? result.token : ""))?.user.id).toBe(coord.id);
    const stored = await prisma.session.findFirstOrThrow({ where: { userId: coord.id } });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("also signs in a cluster coordinator with phone + PIN (regression: PRIVILEGED list must include CLUSTER_COORDINATOR)", async () => {
    const eventId = await defaultEvent();
    const cc = await createUser("CLUSTER_COORDINATOR", { pinHash });
    expect(await pinStatus({ phone: cc.phone, ip })).toEqual({ status: "enter_pin" });
    const result = await loginWithPin({ phone: cc.phone, pin: PIN, eventId, ip });
    expect(result.status).toBe("ok");
    const session = await validateSession(result.status === "ok" ? result.token : "");
    expect(session?.user).toMatchObject({ id: cc.id, eventId, role: "CLUSTER_COORDINATOR" });
  });

  it("returns the same generic result for a wrong PIN, unknown number, attendee number or no PIN yet", async () => {
    const eventId = await defaultEvent();
    const admin = await createUser("ADMIN", { pinHash });
    const noPin = await createUser("COORDINATOR");
    const guest = await createUser("CUSTOMER");
    for (const attempt of [
      { phone: admin.phone, pin: "111222" },
      { phone: "+919812300000", pin: PIN },
      { phone: guest.phone, pin: PIN },
      { phone: noPin.phone, pin: PIN },
      { phone: admin.phone, pin: "12ab" },
    ]) {
      expect(await loginWithPin({ ...attempt, eventId, ip })).toEqual({ status: "invalid" });
    }
  });

  it("locks the account for 15 minutes after 5 wrong PINs, even with the right PIN", async () => {
    const eventId = await defaultEvent();
    const admin = await createUser("ADMIN", { pinHash });
    for (let i = 0; i < 5; i++) await loginWithPin({ phone: admin.phone, pin: "000123", eventId, ip: `10.0.0.${i}` });
    const locked = await loginWithPin({ phone: admin.phone, pin: PIN, eventId, ip: "10.0.1.1" });
    expect(locked.status).toBe("rate_limited");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).pinLockedUntil).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "auth.pinLocked", entityId: admin.id } })).toBe(1);
  });

  it("rate-limits PIN attempts per phone number", async () => {
    const eventId = await defaultEvent();
    const admin = await createUser("ADMIN", { pinHash });
    let last;
    for (let i = 0; i < 11; i++) last = await loginWithPin({ phone: admin.phone, pin: "000123", eventId, ip: `10.1.0.${i}` });
    expect(last?.status).toBe("rate_limited");
  });

  it("phone check: accounts without a PIN are asked to choose one; unknown numbers look like PIN accounts", async () => {
    const withPin = await createUser("ADMIN", { pinHash });
    const without = await createUser("COORDINATOR");
    const guest = await createUser("CUSTOMER");
    expect(await pinStatus({ phone: withPin.phone, ip })).toEqual({ status: "enter_pin" });
    expect(await pinStatus({ phone: without.phone, ip })).toEqual({ status: "needs_pin" });
    // Attendees and unknown numbers get the same answer as PIN accounts (no account discovery).
    expect(await pinStatus({ phone: guest.phone, ip })).toEqual({ status: "enter_pin" });
    expect(await pinStatus({ phone: "+919800000001", ip })).toEqual({ status: "enter_pin" });
    expect(await pinStatus({ phone: "abc", ip })).toEqual({ status: "invalid" });
  });

  it("first sign-in: a person without a PIN chooses one once; it can't be overwritten that way", async () => {
    const eventId = await defaultEvent();
    const coord = await createUser("COORDINATOR");
    expect((await setupPin({ phone: coord.phone, pin: "123456", pinConfirm: "123456", eventId, ip })).status).toBe("weak_pin");
    expect((await setupPin({ phone: coord.phone, pin: PIN, pinConfirm: "482916", eventId, ip })).status).toBe("pin_mismatch");
    expect((await setupPin({ phone: coord.phone, pin: PIN, pinConfirm: PIN, eventId, ip })).status).toBe("ok");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: coord.id } })).pinHash).toMatch(/^scrypt\$/);
    expect((await setupPin({ phone: coord.phone, pin: "593817", pinConfirm: "593817", eventId, ip })).status).toBe("invalid");
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip })).status).toBe("ok");
    expect(await prisma.auditLog.count({ where: { action: "auth.pinSet", entityId: coord.id } })).toBe(1);
  });

  it("first PIN still requires event access, and attendees can't set one", async () => {
    const other = (await createEvent("Other event")).id;
    const coord = await createUser("COORDINATOR");
    const guest = await createUser("CUSTOMER");
    expect((await setupPin({ phone: coord.phone, pin: PIN, pinConfirm: PIN, eventId: other, ip })).status).toBe("no_event_access");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: coord.id } })).pinHash).toBeNull();
    expect((await setupPin({ phone: guest.phone, pin: PIN, pinConfirm: PIN, eventId: await defaultEvent(), ip })).status).toBe("invalid");
  });

  it("a PIN reset disables the old PIN, signs the person out and lets them choose a new one", async () => {
    const eventId = await defaultEvent();
    const coord = await createUser("COORDINATOR", { pinHash });
    const login = await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip });
    await resetPinOf(coord.id);
    expect(await validateSession(login.status === "ok" ? login.token : "")).toBeNull();
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip })).status).toBe("invalid");
    expect(await pinStatus({ phone: coord.phone, ip })).toEqual({ status: "needs_pin" });
    expect((await setupPin({ phone: coord.phone, pin: "593817", pinConfirm: "593817", eventId, ip })).status).toBe("ok");
  });

  it("coordinators can only sign in to events they are registered for; staff to any event", async () => {
    const other = (await createEvent("Other event")).id;
    const eventId = await defaultEvent();
    const coord = await createUser("COORDINATOR", { pinHash });
    const admin = await createUser("ADMIN", { pinHash });
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId: other, ip })).status).toBe("no_event_access");
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId: null, ip })).status).toBe("no_event_access");
    expect((await loginWithPin({ phone: admin.phone, pin: PIN, eventId: other, ip })).status).toBe("ok");
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip })).status).toBe("ok");
  });

  it("deactivation, sign-out and revoke-all end sessions", async () => {
    const eventId = await defaultEvent();
    const admin = await createUser("ADMIN", { pinHash });
    const a = await loginWithPin({ phone: admin.phone, pin: PIN, eventId, ip });
    const b = await loginWithPin({ phone: admin.phone, pin: PIN, eventId, ip });
    const tokenA = a.status === "ok" ? a.token : "";
    const tokenB = b.status === "ok" ? b.token : "";
    await logout(tokenA);
    expect(await validateSession(tokenA)).toBeNull();
    expect(await validateSession(tokenB)).not.toBeNull();
    await prisma.user.update({ where: { id: admin.id }, data: { status: "INACTIVE" } });
    expect(await validateSession(tokenB)).toBeNull();
    await prisma.user.update({ where: { id: admin.id }, data: { status: "ACTIVE" } });
    await revokeAllSessions(admin.id);
    expect(await validateSession(tokenB)).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("attendee sign-in (phone + event; no PIN, no SMS)", () => {
  beforeEach(resetDb);

  it("signs a registered attendee into their event with read-only role and their hotel", async () => {
    const { eventId, guestA, hotelA } = await createTwoHotels();
    const r = await loginAttendee({ phone: guestA.phone, eventId, ip });
    expect(r.status).toBe("ok");
    const session = await validateSession(r.status === "ok" ? r.token : "");
    expect(session?.user).toMatchObject({ id: guestA.id, role: "CUSTOMER", eventId, hotelId: hotelA.id });
  });

  it("refuses attendees of other events, staff numbers and unknown numbers with the same result", async () => {
    const { guestA } = await createTwoHotels();
    const other = (await createEvent("Other")).id;
    const coord = await createUser("COORDINATOR");
    expect(await loginAttendee({ phone: guestA.phone, eventId: other, ip })).toEqual({ status: "invalid" });
    expect(await loginAttendee({ phone: coord.phone, eventId: await defaultEvent(), ip })).toEqual({ status: "invalid" });
    expect(await loginAttendee({ phone: "+919812300001", eventId: await defaultEvent(), ip })).toEqual({ status: "invalid" });
  });


  it("refuses inactive events and ends sessions when the attendee is removed from the event", async () => {
    const { eventId, guestA } = await createTwoHotels();
    const r = await loginAttendee({ phone: guestA.phone, eventId, ip });
    const token = r.status === "ok" ? r.token : "";
    await prisma.eventMember.deleteMany({ where: { userId: guestA.id } });
    expect(await validateSession(token)).toBeNull();
    await prisma.event.update({ where: { id: eventId }, data: { isActive: false } });
    expect((await loginAttendee({ phone: guestA.phone, eventId, ip })).status).toBe("invalid");
  });

  it("asks which guest when a phone number belongs to more than one, and signs in only the chosen one", async () => {
    const { eventId, guestA, hotelA } = await createTwoHotels();
    const sibling = await createUser("CUSTOMER", { eventId, hotelId: hotelA.id });
    await prisma.user.update({ where: { id: sibling.id }, data: { phone: guestA.phone } });

    const ask = await loginAttendee({ phone: guestA.phone, eventId, ip });
    expect(ask.status).toBe("choose_guest");
    if (ask.status !== "choose_guest") throw new Error("expected choose_guest");
    expect(ask.guests.map((g) => g.id).sort()).toEqual([guestA.id, sibling.id].sort());

    const picked = await loginAttendee({ phone: guestA.phone, eventId, userId: sibling.id, ip });
    expect(picked.status).toBe("ok");
    const session = await validateSession(picked.status === "ok" ? picked.token : "");
    expect(session?.user.id).toBe(sibling.id);

    // An id that doesn't belong to this phone+event is refused, not trusted.
    const someoneElse = await createUser("CUSTOMER", { eventId });
    expect(await loginAttendee({ phone: guestA.phone, eventId, userId: someoneElse.id, ip })).toEqual({ status: "invalid" });
  });

  it("rate-limits attendee sign-in attempts per phone number", async () => {
    const eventId = await defaultEvent();
    let last;
    for (let i = 0; i < 11; i++) last = await loginAttendee({ phone: "+919812300002", eventId, ip: `10.2.0.${i}` });
    expect(last?.status).toBe("rate_limited");
  });
});
