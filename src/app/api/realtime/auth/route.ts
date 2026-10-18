import { fail, failFromError } from "@/lib/api/response";
import { isSameOrigin } from "@/lib/api/request";
import { getApiUser } from "@/lib/auth/current-user";
import { realtime } from "@/lib/realtime/publisher";
import { parseBusChannel } from "@/lib/realtime/types";
import { assertCanViewBus } from "@/server/services/transport";

/**
 * Pusher private-channel authorization. A browser may subscribe to
 * `private-bus-{id}` only if the signed-in user may view that bus.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const user = await getApiUser();
  if (!user) return fail("unauthenticated", 401);
  const rt = realtime();
  if (!rt.enabled) return fail("realtime_disabled", 503);

  const form = new URLSearchParams(await request.text());
  const socketId = form.get("socket_id") ?? "";
  const channel = form.get("channel_name") ?? "";
  const busId = parseBusChannel(channel);
  if (!busId || !/^\d+\.\d+$/.test(socketId)) return fail("bad_request", 400);

  try {
    await assertCanViewBus(user, busId);
    return Response.json(rt.authorize(socketId, channel), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return failFromError(err);
  }
}
