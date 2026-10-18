import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import type { Role } from "@/generated/prisma/client";
import { roleHome } from "@/server/services/auth";
import { SESSION_COOKIE, validateSession, type SessionUser } from "./session";

/** The signed-in, active user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const result = await validateSession(token);
  return result?.user ?? null;
});

/**
 * For pages: returns the user or redirects. Unauthenticated → login; wrong role →
 * that user's own homepage. This is a convenience for navigation; data access
 * must still go through policies.
 */
export async function requireUser(locale: string, roles?: readonly Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });
  if (roles && !roles.includes(user!.role)) redirect({ href: roleHome(user!.role), locale });
  return user!;
}

/** For route handlers: the user or null (caller returns 401). */
export async function getApiUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}
