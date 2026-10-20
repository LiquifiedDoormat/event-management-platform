import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, Role } from "@/generated/prisma/client";
import { createSession, revokeSession, type SessionUser } from "@/lib/auth/session";
import { hashPin, isWeakPin, PIN_PATTERN, verifyPin } from "@/lib/auth/pin";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils/phone";

// Sign-in without paid SMS:
// - Owner/Admin/Coordinator: phone + 6-digit PIN. An account without a PIN
//   (new, or reset by an admin) chooses one at its next sign-in with the phone
//   number only (owner decision; risk documented in SECURITY.md).
// - Attendees: registered phone number + event.
//   Attendee sessions are read-only by role (see policies).
// Every path chooses an event; access to it is checked here and on every request.

export type LoginResult =
  | { status: "ok"; token: string; role: Role; locale: SessionUser["preferredLocale"] }
  | { status: "invalid" | "no_event_access" | "weak_pin" | "pin_mismatch" }
  | { status: "rate_limited"; retryAfterSeconds: number };

const PRIVILEGED: Role[] = ["OWNER", "ADMIN", "COORDINATOR"];
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const LIMITS = {
  pinPerPhone: { limit: 10, windowSeconds: 15 * 60 },
  pinPerIp: { limit: 60, windowSeconds: 15 * 60 },
  attendeePerPhone: { limit: 10, windowSeconds: 15 * 60 },
  attendeePerIp: { limit: 120, windowSeconds: 15 * 60 },
};

async function limited(kind: "pin" | "attendee", phone: string, ip: string) {
  const perPhone = LIMITS[`${kind}PerPhone`];
  const perIp = LIMITS[`${kind}PerIp`];
  const [p, i] = await Promise.all([
    rateLimit(`${kind}:phone:${phone}`, perPhone.limit, perPhone.windowSeconds),
    rateLimit(`${kind}:ip:${ip}`, perIp.limit, perIp.windowSeconds),
  ]);
  if (p.allowed && i.allowed) return null;
  return { status: "rate_limited" as const, retryAfterSeconds: Math.max(p.allowed ? 0 : p.retryAfterSeconds, i.allowed ? 0 : i.retryAfterSeconds) };
}

/** Whether `user` may work in `eventId`: staff → any existing event; others → active event they belong to. */
export async function canAccessEvent(user: { id: string; role: Role }, eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { isActive: true } });
  if (!event) return false;
  if (user.role === "OWNER" || user.role === "ADMIN") return true;
  if (!event.isActive) return false;
  return (await prisma.eventMember.count({ where: { eventId, userId: user.id } })) > 0;
}

async function startSession(user: { id: string; role: Role; preferredLocale: SessionUser["preferredLocale"] }, eventId: string | null, userAgent?: string | null) {
  const { token } = await createSession(user.id, eventId, userAgent);
  await prisma.auditLog.create({ data: { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, metadata: { eventId } } });
  return { status: "ok" as const, token, role: user.role, locale: user.preferredLocale };
}

const privilegedUser = (phone: string) =>
  prisma.user.findFirst({
    where: { phone, status: "ACTIVE", role: { in: PRIVILEGED } },
    select: { id: true, role: true, preferredLocale: true, pinHash: true, failedPinAttempts: true, pinLockedUntil: true },
  });

/**
 * Phone + PIN. Wrong PINs count towards a temporary account lockout; every
 * failure returns the same "invalid" result so it can't be used to discover
 * which numbers have accounts.
 */
export async function loginWithPin(input: { phone: string; pin: string; eventId: string | null; ip: string; userAgent?: string | null }): Promise<LoginResult> {
  const phone = normalizePhone(input.phone);
  if (!phone || !PIN_PATTERN.test(input.pin)) return { status: "invalid" };
  const limit = await limited("pin", phone, input.ip);
  if (limit) return limit;

  const user = await privilegedUser(phone);
  if (!user || !user.pinHash) return { status: "invalid" };
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    return { status: "rate_limited", retryAfterSeconds: Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000) };
  }
  if (!(await verifyPin(input.pin, user.pinHash))) {
    const failures = user.failedPinAttempts + 1;
    const lock = failures >= LOCK_AFTER;
    await prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedPinAttempts: 0, pinLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { failedPinAttempts: failures },
    });
    if (lock) await prisma.auditLog.create({ data: { actorId: null, action: "auth.pinLocked", entityType: "User", entityId: user.id } });
    return { status: "invalid" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedPinAttempts: 0, pinLockedUntil: null } });
  await resetRateLimit(`pin:phone:${phone}`);
  const eventId = await resolveLoginEvent(user, input.eventId);
  if (eventId === false) return { status: "no_event_access" };
  return startSession(user, eventId, input.userAgent);
}

/** Staff may sign in with no event selected only when no events exist yet. */
async function resolveLoginEvent(user: { id: string; role: Role }, eventId: string | null): Promise<string | null | false> {
  if (eventId) return (await canAccessEvent(user, eventId)) ? eventId : false;
  if ((user.role === "OWNER" || user.role === "ADMIN") && (await prisma.event.count()) === 0) return null;
  return false;
}

/**
 * Staff sign-in step 1: does this number need to choose a PIN? Only an active
 * Owner/Admin/Coordinator account without a PIN (new, or reset by an admin)
 * gets "needs_pin"; everything else — including unknown numbers — gets "enter_pin",
 * so the answer only reveals accounts that are waiting for their first PIN.
 */
export async function pinStatus(input: { phone: string; ip: string }): Promise<{ status: "enter_pin" | "needs_pin" | "invalid" } | { status: "rate_limited"; retryAfterSeconds: number }> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: "invalid" };
  const limit = await limited("pin", phone, input.ip);
  if (limit) return limit;
  const user = await prisma.user.findFirst({ where: { phone, status: "ACTIVE", role: { in: PRIVILEGED } }, select: { pinHash: true } });
  return { status: user && !user.pinHash ? "needs_pin" : "enter_pin" };
}

/**
 * First sign-in, or after an admin reset: choose a PIN with the phone number
 * only. Allowed only while the account has no PIN. Residual risk (documented
 * in SECURITY.md): until the person sets it, anyone who knows their number could.
 */
export async function setupPin(input: {
  phone: string;
  pin: string;
  pinConfirm: string;
  eventId: string | null;
  ip: string;
  userAgent?: string | null;
}): Promise<LoginResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: "invalid" };
  const limit = await limited("pin", phone, input.ip);
  if (limit) return limit;
  if (!PIN_PATTERN.test(input.pin)) return { status: "invalid" };
  if (input.pin !== input.pinConfirm) return { status: "pin_mismatch" };
  if (isWeakPin(input.pin)) return { status: "weak_pin" };

  const user = await prisma.user.findFirst({
    where: { phone, status: "ACTIVE", role: { in: PRIVILEGED }, pinHash: null },
    select: { id: true, role: true, preferredLocale: true },
  });
  if (!user) return { status: "invalid" };

  const eventId = await resolveLoginEvent(user, input.eventId);
  if (eventId === false) return { status: "no_event_access" };
  // Conditional update: if two requests race, only the first sets the PIN.
  const updated = await prisma.user.updateMany({
    where: { id: user.id, pinHash: null },
    data: { pinHash: await hashPin(input.pin), failedPinAttempts: 0, pinLockedUntil: null },
  });
  if (updated.count === 0) return { status: "invalid" };
  await prisma.auditLog.create({ data: { actorId: user.id, action: "auth.pinSet", entityType: "User", entityId: user.id } });
  await resetRateLimit(`pin:phone:${phone}`);
  return startSession(user, eventId, input.userAgent);
}

/** Attendee sign-in: registered phone number for the chosen event. No PIN, no SMS. */
export async function loginAttendee(input: { phone: string; eventId: string; ip: string; userAgent?: string | null }): Promise<LoginResult> {
  const phone = normalizePhone(input.phone);
  if (!phone || !input.eventId) return { status: "invalid" };
  const limit = await limited("attendee", phone, input.ip);
  if (limit) return limit;

  if (!(await prisma.event.count({ where: { id: input.eventId, isActive: true } }))) return { status: "invalid" };
  const user = await prisma.user.findFirst({
    where: { phone, status: "ACTIVE", role: "CUSTOMER", memberships: { some: { eventId: input.eventId } } },
    select: { id: true, role: true, preferredLocale: true },
  });
  if (!user) return { status: "invalid" };
  return startSession(user, input.eventId, input.userAgent);
}

/**
 * PIN reset by an authorized admin (or the Owner CLI): removes the PIN and
 * signs the person out everywhere. Their next sign-in asks them to choose a new
 * PIN. Callers check authorization (canResetPin) first.
 */
export async function clearPin(tx: Prisma.TransactionClient, userId: string) {
  await tx.user.update({ where: { id: userId }, data: { pinHash: null, failedPinAttempts: 0, pinLockedUntil: null } });
  await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function logout(token: string | undefined) {
  if (token) await revokeSession(token);
}

/** Where each role lands after sign-in (locale prefix added by the caller). */
export function roleHome(role: Role): string {
  return {
    OWNER: "/owner",
    ADMIN: "/admin",
    CLUSTER_COORDINATOR: "/cluster-coordinator",
    COORDINATOR: "/coordinator",
    CUSTOMER: "/customer",
  }[role];
}
