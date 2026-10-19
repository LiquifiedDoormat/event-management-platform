import createMiddleware from "next-intl/middleware";
import type { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

// Runs before every page request:
// 1. next-intl locale detection/redirects.
// 2. A per-request nonce-based Content-Security-Policy (all pages render
//    dynamically, so every response gets a fresh nonce; Next.js applies it to
//    its own scripts automatically by reading the CSP request header).
// Authentication and authorization are NOT done here; they are enforced in
// every page, route handler and server action.

const handleI18n = createMiddleware(routing);

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets trusted scripts (Next.js, Maps loader) load what they need.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://maps.googleapis.com${dev ? " 'unsafe-eval'" : ""}`,
    // Google Maps injects inline styles; CSS injection risk is low compared to scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Adds request headers for the page renderer on top of whatever next-intl set.
 * Next.js forwards request-header overrides via `x-middleware-request-*`
 * response headers plus an `x-middleware-override-headers` list; if no list
 * exists yet, all original headers must be listed too or they would be dropped.
 */
function addRequestHeaders(response: NextResponse, request: NextRequest, extra: Record<string, string>) {
  const existing = response.headers.get("x-middleware-override-headers");
  const keys = new Set(existing ? existing.split(",") : []);
  if (!existing) {
    request.headers.forEach((value, key) => {
      response.headers.set(`x-middleware-request-${key}`, value);
      keys.add(key);
    });
  }
  for (const [key, value] of Object.entries(extra)) {
    response.headers.set(`x-middleware-request-${key}`, value);
    keys.add(key);
  }
  response.headers.set("x-middleware-override-headers", [...keys].join(","));
}

export default function proxy(request: NextRequest) {
  const response = handleI18n(request);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  addRequestHeaders(response, request, { "x-nonce": nonce, "content-security-policy": csp });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Pages only: skip API routes, Next.js internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
