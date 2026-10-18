import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { clientIp, isSameOrigin, readJson } from "@/lib/api/request";
import { requestOtp } from "@/server/services/auth";

const Body = z.object({ phone: z.string().min(1).max(32) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const body = Body.safeParse(await readJson(request));
  if (!body.success) return fail("bad_request", 400);

  try {
    const result = await requestOtp({ phone: body.data.phone, ip: clientIp(request) });
    switch (result.status) {
      case "sent":
        return ok({ sent: true });
      case "invalid_phone":
        return fail("invalid_phone", 400);
      case "rate_limited":
        return fail("rate_limited", 429, { "Retry-After": String(result.retryAfterSeconds) });
      case "unavailable":
        return fail("provider_unavailable", 503);
    }
  } catch (err) {
    console.error("[auth] otp request failed", (err as Error).name);
    return fail("server_error", 500);
  }
}
