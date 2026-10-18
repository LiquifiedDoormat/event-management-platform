import { prisma } from "@/lib/db/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Keep ended/revoked sessions briefly for troubleshooting, then delete them. */
const SESSION_GRACE_DAYS = 7;

/**
 * Data-retention cleanup. Safe to run repeatedly (e.g. daily):
 * - GPS history points older than EventConfig.locationRetentionDays
 * - sessions expired or revoked more than SESSION_GRACE_DAYS ago
 * - expired rate-limit counters
 * Never touches the latest bus positions, trips or status history.
 */
export async function pruneOldData(now = new Date()) {
  const config = await prisma.eventConfig.findUnique({ where: { id: 1 }, select: { locationRetentionDays: true } });
  const retentionDays = config?.locationRetentionDays ?? 7;
  const sessionCutoff = new Date(now.getTime() - SESSION_GRACE_DAYS * DAY_MS);

  const [locationPoints, sessions, rateLimits] = await Promise.all([
    prisma.locationPoint.deleteMany({ where: { recordedAt: { lt: new Date(now.getTime() - retentionDays * DAY_MS) } } }),
    prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { retentionDays, locationPoints: locationPoints.count, sessions: sessions.count, rateLimits: rateLimits.count };
}
