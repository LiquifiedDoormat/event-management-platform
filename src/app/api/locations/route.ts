import { z } from "zod";
import { fail, failFromError, ok } from "@/lib/api/response";
import { isSameOrigin, readJson } from "@/lib/api/request";
import { getApiUser } from "@/lib/auth/current-user";
import { recordLocation } from "@/server/services/trips";

const Body = z.object({
  tripId: z.string().min(1).max(40),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100_000).nullable(),
  recordedAt: z.number().int().positive(),
});

/** GPS reading from the coordinator's phone. Only the active trip's coordinator is accepted. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const user = await getApiUser();
  if (!user) return fail("unauthenticated", 401);
  const body = Body.safeParse(await readJson(request, 1000));
  if (!body.success) return fail("bad_request", 400);
  try {
    return ok(await recordLocation(user, body.data));
  } catch (err) {
    return failFromError(err);
  }
}
