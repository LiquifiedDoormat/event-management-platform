import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { devExpireCode, devLastCodeFor } from "@/lib/auth/otp/dev";
import { revokeAllSessions, validateSession } from "@/lib/auth/session";
import { logout, requestOtp, verifyOtp } from "@/server/services/auth";
import { createUser, hasTestDb, resetDb } from "./helpers";

const ip = "203.0.113.7";

async function signIn(phone: string) {
  expect(await requestOtp({ phone, ip })).toEqual({ status: "sent" });
  const code = devLastCodeFor(phone);
  expect(code).toMatch(/^\d{6}$/);
  const result = await verifyOtp({ phone, code: code!, ip });
  if (result.status !== "ok") throw new Error(`login failed: ${result.status}`);
  return result;
}

describe.skipIf(!hasTestDb)("phone OTP authentication", () => {
  beforeEach(resetDb);

  it("signs in a registered user and the session persists", async () => {
    const user = await createUser("CUSTOMER");
    const { token, user: signedIn } = await signIn(user.phone);
    expect(signedIn.id).toBe(user.id);

    // A later request (e.g. after a browser restart) with the same cookie still works.
    const again = await validateSession(token);
    expect(again?.user.id).toBe(user.id);

    // Only the hash is stored.
    const stored = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts the national format without +91", async () => {
    const user = await createUser("CUSTOMER");
    const local = user.phone.replace("+91", "");
    expect(await requestOtp({ phone: local, ip })).toEqual({ status: "sent" });
    const res = await verifyOtp({ phone: local, code: devLastCodeFor(user.phone)!, ip });
    expect(res.status).toBe("ok");
  });

  it("gives unknown numbers the same response but sends nothing", async () => {
    const phone = "+919812300000";
    expect(await requestOtp({ phone, ip })).toEqual({ status: "sent" });
    expect(devLastCodeFor(phone)).toBeUndefined();
    expect((await verifyOtp({ phone, code: "123456", ip })).status).toBe("invalid");
  });

  it("rejects malformed phone numbers", async () => {
    expect(await requestOtp({ phone: "12345", ip })).toEqual({ status: "invalid_phone" });
  });

  it("rejects a wrong code, then accepts the right one", async () => {
    const user = await createUser("ADMIN");
    await requestOtp({ phone: user.phone, ip });
    const code = devLastCodeFor(user.phone)!;
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await verifyOtp({ phone: user.phone, code: wrong, ip })).status).toBe("invalid");
    expect((await verifyOtp({ phone: user.phone, code, ip })).status).toBe("ok");
  });

  it("reports an expired code", async () => {
    const user = await createUser("CUSTOMER");
    await requestOtp({ phone: user.phone, ip });
    const code = devLastCodeFor(user.phone)!;
    devExpireCode(user.phone);
    expect((await verifyOtp({ phone: user.phone, code, ip })).status).toBe("expired");
  });

  it("does not let inactive accounts sign in", async () => {
    const user = await createUser("CUSTOMER", { status: "INACTIVE" });
    expect(await requestOtp({ phone: user.phone, ip })).toEqual({ status: "sent" });
    expect(devLastCodeFor(user.phone)).toBeUndefined();
  });

  it("ends existing sessions when an account is deactivated", async () => {
    const user = await createUser("CUSTOMER");
    const { token } = await signIn(user.phone);
    await prisma.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });
    expect(await validateSession(token)).toBeNull();
  });

  it("signs out", async () => {
    const user = await createUser("CUSTOMER");
    const { token } = await signIn(user.phone);
    await logout(token);
    expect(await validateSession(token)).toBeNull();
  });

  it("can revoke all of a user's sessions", async () => {
    const user = await createUser("CUSTOMER");
    const a = await signIn(user.phone);
    const b = await signIn(user.phone);
    await revokeAllSessions(user.id);
    expect(await validateSession(a.token)).toBeNull();
    expect(await validateSession(b.token)).toBeNull();
  });

  it("rejects expired sessions and garbage tokens", async () => {
    const user = await createUser("CUSTOMER");
    const { token } = await signIn(user.phone);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSession(token)).toBeNull();
    expect(await validateSession("not-a-real-token")).toBeNull();
    expect(await validateSession(undefined)).toBeNull();
  });

  it("applies role changes on the next request", async () => {
    const user = await createUser("CUSTOMER");
    const { token } = await signIn(user.phone);
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    expect((await validateSession(token))?.user.role).toBe("ADMIN");
  });

  it("rate-limits OTP requests per phone number", async () => {
    const user = await createUser("CUSTOMER");
    for (let i = 0; i < 5; i++) expect((await requestOtp({ phone: user.phone, ip })).status).toBe("sent");
    const blocked = await requestOtp({ phone: user.phone, ip });
    expect(blocked.status).toBe("rate_limited");
  });

  it("rate-limits verification attempts per phone number", async () => {
    const user = await createUser("CUSTOMER");
    await requestOtp({ phone: user.phone, ip });
    let last;
    for (let i = 0; i < 9; i++) last = await verifyOtp({ phone: user.phone, code: "000001", ip });
    expect(last?.status).toBe("rate_limited");
  });
});
