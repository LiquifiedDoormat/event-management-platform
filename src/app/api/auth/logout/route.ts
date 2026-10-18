import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api/response";
import { isSameOrigin } from "@/lib/api/request";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { logout } from "@/server/services/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const store = await cookies();
  try {
    await logout(store.get(SESSION_COOKIE)?.value);
  } catch (err) {
    console.error("[auth] logout failed", (err as Error).name);
    return fail("server_error", 500);
  }
  store.delete(SESSION_COOKIE);
  return ok({ signedOut: true });
}
