import "server-only";
import { prisma } from "@/lib/db/prisma";
import { randomToken, sha256 } from "@/lib/utils/crypto";
import type { AccountStatus, Locale, Role } from "@/generated/prisma/client";

// Server-side sessions. The browser holds a random token in an HttpOnly cookie;
// the database holds only its SHA-256 hash, so a database leak exposes no usable tokens.

export const SESSION_TTL_DAYS = 30;
/** Expiry is pushed forward at most once per this interval, to limit writes. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-session" : "session";

// The cookie outlives the server-side expiry on purpose: validity is decided by
// Session.expiresAt (sliding, renewed on use), which server components can extend
// without having to rewrite the cookie.
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
};

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  status: AccountStatus;
  hotelId: string | null;
  preferredLocale: Locale;
};

const userSelect = {
  id: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  hotelId: true,
  preferredLocale: true,
} as const;

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt };
}

/**
 * Resolves a session token to its (active) user, or null. The user row is read
 * fresh on every call, so role, status and hotel changes apply immediately.
 */
export async function validateSession(
  token: string | undefined | null,
): Promise<{ user: SessionUser; sessionId: string } | null> {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, expiresAt: true, lastUsedAt: true, revokedAt: true, user: { select: userSelect } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  if (Date.now() - session.lastUsedAt.getTime() > RENEW_AFTER_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) },
    });
  }
  return { user: session.user, sessionId: session.id };
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Signs a user out everywhere, e.g. on deactivation or role change. */
export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
