import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { can, type Actor } from "@/server/policies";
import { forbidden } from "@/server/errors";
import { audit } from "./audit";
import { pageArgs, toPage } from "./pagination";

// Owner-only: event-wide settings and the audit log.

/** Bounds match the CHECK constraint in the init migration. */
export const settingsInput = z.object({
  eventName: z.string().trim().min(1, "required").max(120, "tooLong"),
  staleLocationSeconds: z.coerce.number({ error: "invalidNumber" }).int("invalidNumber").min(15, "outOfRange").max(3600, "outOfRange"),
  locationRetentionDays: z.coerce.number({ error: "invalidNumber" }).int("invalidNumber").min(0, "outOfRange").max(365, "outOfRange"),
  historySampleSeconds: z.coerce.number({ error: "invalidNumber" }).int("invalidNumber").min(5, "outOfRange").max(3600, "outOfRange"),
});
export type SettingsInput = z.infer<typeof settingsInput>;

const DEFAULTS: SettingsInput = { eventName: "Event", staleLocationSeconds: 120, locationRetentionDays: 7, historySampleSeconds: 30 };

export async function getSettings(actor: Actor): Promise<SettingsInput & { updatedAt: Date | null }> {
  if (!can(actor, "config.update")) throw forbidden();
  const row = await prisma.eventConfig.findUnique({
    where: { id: 1 },
    select: { eventName: true, staleLocationSeconds: true, locationRetentionDays: true, historySampleSeconds: true, updatedAt: true },
  });
  return row ?? { ...DEFAULTS, updatedAt: null };
}

export async function updateSettings(actor: Actor, input: SettingsInput) {
  if (!can(actor, "config.update")) throw forbidden();
  await prisma.$transaction(async (tx) => {
    const before = await tx.eventConfig.findUnique({ where: { id: 1 } });
    await tx.eventConfig.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
    const changed = Object.fromEntries(
      Object.entries(input).filter(([k, v]) => before?.[k as keyof SettingsInput] !== v),
    );
    await audit(tx, actor, "config.update", "EventConfig", "1", changed);
  });
}

export const AUDIT_ENTITY_TYPES = ["Hotel", "Bus", "User", "Trip", "EventConfig"] as const;

/** Newest first, 25 per page, optional entity filter. */
export async function listAuditLog(actor: Actor, opts: { cursor?: string; entityType?: string; includeSignIns?: boolean }) {
  if (!can(actor, "audit.view")) throw forbidden();
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(opts.entityType ? { entityType: opts.entityType } : {}),
      // Sign-ins are frequent and rarely interesting; hidden unless asked for.
      ...(opts.includeSignIns ? {} : { action: { not: "auth.login" } }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(opts.cursor),
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
  });
  return toPage(rows);
}
