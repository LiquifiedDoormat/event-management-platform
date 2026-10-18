import "server-only";
import { env } from "@/config/env";

/**
 * CSRF defence for cookie-authenticated, state-changing route handlers (in
 * addition to SameSite=Lax cookies): the request must come from our own origin.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(env().APP_URL).origin;
  // Browsers that omit Origin still send Fetch Metadata.
  return request.headers.get("sec-fetch-site") === "same-origin";
}

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Parses a JSON body, returning undefined for malformed or oversized input. */
export async function readJson(request: Request, maxBytes = 10_000): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
