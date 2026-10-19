import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { requireUser } from "@/lib/auth/current-user";
import { redirect } from "@/i18n/navigation";

/** First value of a search param. */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Owner/Admin pages. Event-scoped pages need a selected event; with none yet
 * (fresh installation) staff are sent to the Events page to create one.
 */
export async function requireStaff(locale: string, opts: { needsEvent?: boolean } = {}) {
  const user = await requireUser(locale, ["OWNER", "ADMIN"]);
  if (opts.needsEvent !== false && !user.eventId) redirect({ href: "/events", locale });
  return user;
}

/** Turns not-found / forbidden service errors into a 404 page (never reveals existence). */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AppError && (err.code === "not_found" || err.code === "forbidden")) notFound();
    throw err;
  }
}
