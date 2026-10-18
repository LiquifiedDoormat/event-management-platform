import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/policies";

/**
 * Records a sensitive change inside the caller's transaction. `changes` should
 * hold only the fields that changed (no secrets, no OTPs, no tokens).
 */
export function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({ data: { actorId: actor.id, action, entityType, entityId, metadata: changes } });
}
