import { z } from "zod";
import { fail } from "@/lib/api/response";
import { clientIp, isSameOrigin, readJson } from "@/lib/api/request";
import { loginResponse } from "@/lib/api/auth-response";
import { loginWithPin } from "@/server/services/auth";

const Body = z.object({
  phone: z.string().min(1).max(32),
  pin: z.string().max(12),
  eventId: z.string().max(40).nullable(),
});

/** Owner/Admin/Coordinator sign-in with phone + PIN. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const body = Body.safeParse(await readJson(request));
  if (!body.success) return fail("bad_request", 400);
  try {
    return loginResponse(await loginWithPin({ ...body.data, ip: clientIp(request), userAgent: request.headers.get("user-agent") }));
  } catch (err) {
    console.error("[auth] pin login failed", (err as Error).name);
    return fail("server_error", 500);
  }
}
