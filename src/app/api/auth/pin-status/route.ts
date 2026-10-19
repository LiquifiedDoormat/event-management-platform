import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { clientIp, isSameOrigin, readJson } from "@/lib/api/request";
import { pinStatus } from "@/server/services/auth";

const Body = z.object({ phone: z.string().min(1).max(32) });

/** Staff sign-in step 1: should this number enter its PIN or choose one? */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const body = Body.safeParse(await readJson(request));
  if (!body.success) return fail("bad_request", 400);
  try {
    const result = await pinStatus({ phone: body.data.phone, ip: clientIp(request) });
    if (result.status === "rate_limited") return fail("rate_limited", 429, { "Retry-After": String(result.retryAfterSeconds) });
    if (result.status === "invalid") return fail("invalid_credentials", 400);
    return ok({ next: result.status });
  } catch (err) {
    console.error("[auth] pin status failed", (err as Error).name);
    return fail("server_error", 500);
  }
}
