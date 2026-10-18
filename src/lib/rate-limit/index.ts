import "server-only";
import { prisma } from "@/lib/db/prisma";
import { sha256 } from "@/lib/utils/crypto";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window counter stored in PostgreSQL. One atomic statement per call, so it
 * is safe across stateless server instances. Keys are hashed so phone numbers
 * and IPs are not stored in clear text.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const hashed = sha256(key);
  const rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt")
    VALUES (${hashed}, 1, now(), now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"       = CASE WHEN "RateLimitBucket"."expiresAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."expiresAt" <= now() THEN now() ELSE "RateLimitBucket"."windowStart" END,
      "expiresAt"   = CASE WHEN "RateLimitBucket"."expiresAt" <= now()
                           THEN now() + make_interval(secs => ${windowSeconds})
                           ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  const { count, expiresAt } = rows[0];
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

/** Clears a counter, e.g. after a successful verification. */
export async function resetRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key: sha256(key) } });
}

/** Limits used by the auth flow. Tuned for elderly users who may mistype. */
export const AUTH_LIMITS = {
  otpSendPerPhone: { limit: 5, windowSeconds: 15 * 60 },
  otpSendPerIp: { limit: 30, windowSeconds: 15 * 60 },
  otpVerifyPerPhone: { limit: 8, windowSeconds: 15 * 60 },
  otpVerifyPerIp: { limit: 60, windowSeconds: 15 * 60 },
} as const;
