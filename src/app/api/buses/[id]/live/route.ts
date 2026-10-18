import { fail, failFromError, ok } from "@/lib/api/response";
import { getApiUser } from "@/lib/auth/current-user";
import { getLiveBus } from "@/server/services/transport";

/** Latest status + position for one bus. Polling fallback when realtime is unavailable. */
export async function GET(_request: Request, { params }: RouteContext<"/api/buses/[id]/live">) {
  const user = await getApiUser();
  if (!user) return fail("unauthenticated", 401);
  try {
    return ok(await getLiveBus(user, (await params).id));
  } catch (err) {
    return failFromError(err);
  }
}
