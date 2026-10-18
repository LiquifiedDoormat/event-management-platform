import "server-only";
import { prisma } from "@/lib/db/prisma";
import { otpProvider } from "@/lib/auth/otp";
import { createSession, revokeSession, type SessionUser } from "@/lib/auth/session";
import { AUTH_LIMITS, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils/phone";

// Phone OTP login. Accounts are provisioned by staff; the phone number only
// identifies an existing account. Responses never reveal whether a number is
// registered: unknown and inactive numbers get the same "sent" response but no SMS.

export type RequestOtpResult =
  | { status: "sent" }
  | { status: "invalid_phone" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

export type VerifyOtpResult =
  | { status: "ok"; user: SessionUser; token: string; expiresAt: Date }
  | { status: "invalid" | "expired" | "unavailable" }
  | { status: "rate_limited"; retryAfterSeconds: number };

async function checkLimits(phone: string, ip: string, kind: "Send" | "Verify") {
  const perPhone = AUTH_LIMITS[`otp${kind}PerPhone`];
  const perIp = AUTH_LIMITS[`otp${kind}PerIp`];
  const [p, i] = await Promise.all([
    rateLimit(`otp${kind}:phone:${phone}`, perPhone.limit, perPhone.windowSeconds),
    rateLimit(`otp${kind}:ip:${ip}`, perIp.limit, perIp.windowSeconds),
  ]);
  if (p.allowed && i.allowed) return null;
  return Math.max(p.allowed ? 0 : p.retryAfterSeconds, i.allowed ? 0 : i.retryAfterSeconds);
}

const findActiveUser = (phone: string) =>
  prisma.user.findFirst({
    where: { phone, status: "ACTIVE" },
    select: { id: true, name: true, phone: true, role: true, status: true, hotelId: true, preferredLocale: true },
  });

export async function requestOtp(input: { phone: string; ip: string }): Promise<RequestOtpResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: "invalid_phone" };

  const retryAfter = await checkLimits(phone, input.ip, "Send");
  if (retryAfter !== null) return { status: "rate_limited", retryAfterSeconds: retryAfter };

  const user = await findActiveUser(phone);
  if (!user) return { status: "sent" };

  const result = await otpProvider().send(phone);
  if (result.ok) return { status: "sent" };
  return result.reason === "rate_limited"
    ? { status: "rate_limited", retryAfterSeconds: 60 }
    : { status: "unavailable" };
}

export async function verifyOtp(input: {
  phone: string;
  code: string;
  ip: string;
  userAgent?: string | null;
}): Promise<VerifyOtpResult> {
  const phone = normalizePhone(input.phone);
  const code = input.code.trim();
  if (!phone || !/^\d{4,8}$/.test(code)) return { status: "invalid" };

  const retryAfter = await checkLimits(phone, input.ip, "Verify");
  if (retryAfter !== null) return { status: "rate_limited", retryAfterSeconds: retryAfter };

  const user = await findActiveUser(phone);
  if (!user) return { status: "invalid" };

  const result = await otpProvider().check(phone, code);
  if (!result.ok) {
    if (result.reason === "rate_limited") return { status: "rate_limited", retryAfterSeconds: 60 };
    return { status: result.reason };
  }

  const { token, expiresAt } = await createSession(user.id, input.userAgent);
  await Promise.all([
    resetRateLimit(`otpVerify:phone:${phone}`),
    prisma.auditLog.create({ data: { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id } }),
  ]);
  return { status: "ok", user, token, expiresAt };
}

export async function logout(token: string | undefined) {
  if (token) await revokeSession(token);
}

/** Where each role lands after sign-in (locale prefix added by the caller). */
export function roleHome(role: SessionUser["role"]): string {
  return { OWNER: "/owner", ADMIN: "/admin", COORDINATOR: "/coordinator", CUSTOMER: "/customer" }[role];
}
