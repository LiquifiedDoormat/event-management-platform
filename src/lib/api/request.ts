import "server-only";
import { env } from "@/config/env";

/**
 * CSRF defence for cookie-authenticated, state-changing route handlers (in
 * addition to SameSite=Lax cookies): the request must come from the site that
 * served it. The browser-set Origin is compared with the request's own host
 * (works on every domain, including Vercel preview URLs), or with APP_URL.
 * Neither header can be set by another site's page.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return originHost === host || origin === new URL(env().APP_URL).origin;
  }
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
