import { cookies } from "next/headers";
import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { clientIp, isSameOrigin, readJson } from "@/lib/api/request";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { roleHome, verifyOtp } from "@/server/services/auth";

const Body = z.object({ phone: z.string().min(1).max(32), code: z.string().min(1).max(12) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const body = Body.safeParse(await readJson(request));
  if (!body.success) return fail("bad_request", 400);

  try {
    const result = await verifyOtp({
      ...body.data,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    switch (result.status) {
      case "ok": {
        (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions);
        return ok({ redirectTo: roleHome(result.user.role), locale: result.user.preferredLocale });
      }
      case "invalid":
        return fail("invalid_code", 400);
      case "expired":
        return fail("code_expired", 400);
      case "rate_limited":
        return fail("rate_limited", 429, { "Retry-After": String(result.retryAfterSeconds) });
      case "unavailable":
        return fail("provider_unavailable", 503);
    }
  } catch (err) {
    console.error("[auth] otp verify failed", (err as Error).name);
    return fail("server_error", 500);
  }
}
