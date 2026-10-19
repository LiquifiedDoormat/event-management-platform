import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { hashPin } from "@/lib/auth/pin";
import { revokeAllSessions, validateSession } from "@/lib/auth/session";
import { issueSetupCode, loginAttendee, loginWithPin, logout, setupPin } from "@/server/services/auth";
import { createEvent, createTwoHotels, createUser, defaultEvent, hasTestDb, resetDb } from "./helpers";

const ip = "203.0.113.7";
const PIN = "482915";
let pinHash: string;

async function withSetupCode(userId: string) {
  return prisma.$transaction((tx) => issueSetupCode(tx, userId));
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

  it("first sign-in: a valid setup code sets the PIN once; the code can't be reused", async () => {
    const eventId = await defaultEvent();
    const coord = await createUser("COORDINATOR");
    const code = await withSetupCode(coord.id);
    expect((await setupPin({ phone: coord.phone, setupCode: "WRONG-CODE1", pin: PIN, pinConfirm: PIN, eventId, ip })).status).toBe("invalid");
    expect((await setupPin({ phone: coord.phone, setupCode: code, pin: "123456", pinConfirm: "123456", eventId, ip })).status).toBe("weak_pin");
    expect((await setupPin({ phone: coord.phone, setupCode: code, pin: PIN, pinConfirm: "482916", eventId, ip })).status).toBe("pin_mismatch");
    expect((await setupPin({ phone: coord.phone, setupCode: code.toLowerCase(), pin: PIN, pinConfirm: PIN, eventId, ip })).status).toBe("ok");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: coord.id } })).pinHash).toMatch(/^scrypt\$/);
    expect((await setupPin({ phone: coord.phone, setupCode: code, pin: "593817", pinConfirm: "593817", eventId, ip })).status).toBe("invalid");
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip })).status).toBe("ok");
  });

  it("rejects expired setup codes and codes used with another person's phone", async () => {
    const eventId = await defaultEvent();
    const a = await createUser("COORDINATOR");
    const b = await createUser("COORDINATOR");
    const code = await withSetupCode(a.id);
    expect((await setupPin({ phone: b.phone, setupCode: code, pin: PIN, pinConfirm: PIN, eventId, ip })).status).toBe("invalid");
    await prisma.user.update({ where: { id: a.id }, data: { pinSetupExpiresAt: new Date(Date.now() - 1000) } });
    expect((await setupPin({ phone: a.phone, setupCode: code, pin: PIN, pinConfirm: PIN, eventId, ip })).status).toBe("invalid");
  });

  it("issuing a setup code (PIN reset) disables the old PIN and signs the person out", async () => {
    const eventId = await defaultEvent();
    const coord = await createUser("COORDINATOR", { pinHash });
    const login = await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip });
    await withSetupCode(coord.id);
    expect(await validateSession(login.status === "ok" ? login.token : "")).toBeNull();
    expect((await loginWithPin({ phone: coord.phone, pin: PIN, eventId, ip })).status).toBe("invalid");
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

  it("rate-limits attendee sign-in attempts per phone number", async () => {
    const eventId = await defaultEvent();
    let last;
    for (let i = 0; i < 11; i++) last = await loginAttendee({ phone: "+919812300002", eventId, ip: `10.2.0.${i}` });
    expect(last?.status).toBe("rate_limited");
  });
});
