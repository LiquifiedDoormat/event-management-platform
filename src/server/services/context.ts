import "server-only";
import { AppError } from "@/server/errors";
import type { Actor } from "@/server/policies";

/**
 * The event every event-scoped query is restricted to: the one selected in the
 * actor's session (re-validated per request). Never taken from the URL or form.
 */
export function eventOf(actor: Actor): string {
  if (!actor.eventId) throw new AppError("invalid", "noEventSelected");
  return actor.eventId;
}
