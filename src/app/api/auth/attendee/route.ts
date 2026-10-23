import { z } from "zod";
import { fail } from "@/lib/api/response";
import { clientIp, isSameOrigin, readJson } from "@/lib/api/request";
import { loginResponse } from "@/lib/api/auth-response";
import { loginAttendee } from "@/server/services/auth";

const Body = z.object({
  phone: z.string().min(1).max(32),
  eventId: z.string().min(1).max(40),
  userId: z.string().min(1).max(40).optional(),
});

/** Attendee sign-in: phone number registered for the chosen event. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const body = Body.safeParse(await readJson(request));
  if (!body.success) return fail("bad_request", 400);
  try {
    return loginResponse(await loginAttendee({ ...body.data, ip: clientIp(request), userAgent: request.headers.get("user-agent") }));
  } catch (err) {
    console.error("[auth] attendee login failed", (err as Error).name);
    return fail("server_error", 500);
  }
}
