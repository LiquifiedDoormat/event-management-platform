import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { requireUser } from "@/lib/auth/current-user";

/** First value of a search param. */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Owner/Admin pages. */
export const requireStaff = (locale: string) => requireUser(locale, ["OWNER", "ADMIN"]);

/** Turns not-found / forbidden service errors into a 404 page (never reveals existence). */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AppError && (err.code === "not_found" || err.code === "forbidden")) notFound();
    throw err;
  }
}
