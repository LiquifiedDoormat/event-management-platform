import "server-only";
import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api/response";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { roleHome, type LoginResult } from "@/server/services/auth";

/** Shared response for the three sign-in routes: sets the session cookie on success. */
export async function loginResponse(result: LoginResult) {
  switch (result.status) {
    case "ok":
      (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions);
      return ok({ redirectTo: roleHome(result.role), locale: result.locale });
    case "choose_guest":
      return ok({ chooseGuest: true as const, guests: result.guests });
    case "invalid":
      return fail("invalid_credentials", 400);
    case "no_event_access":
      return fail("no_event_access", 403);
    case "weak_pin":
      return fail("weak_pin", 400);
    case "pin_mismatch":
      return fail("pin_mismatch", 400);
    case "rate_limited":
      return fail("rate_limited", 429, { "Retry-After": String(result.retryAfterSeconds) });
  }
}
