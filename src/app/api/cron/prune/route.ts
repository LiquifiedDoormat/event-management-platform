import { fail, ok } from "@/lib/api/response";
import { safeEqual } from "@/lib/utils/crypto";
import { pruneOldData } from "@/server/services/maintenance";

/**
 * Daily data-retention cleanup, called by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.startsWith("<")) return fail("forbidden", 503);
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return fail("forbidden", 401);
  try {
    const result = await pruneOldData();
    console.info("[cron] prune", JSON.stringify(result));
    return ok(result);
  } catch (err) {
    console.error("[cron] prune failed", (err as Error).name);
    return fail("server_error", 500);
  }
}
