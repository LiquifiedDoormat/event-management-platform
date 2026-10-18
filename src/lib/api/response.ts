import { AppError } from "@/server/errors";

// Consistent JSON envelope for all API routes:
//   success → { ok: true, data }      failure → { ok: false, error: { code } }
// Error codes are stable strings the client maps to translated messages.
// Never put exception details in responses.

export type ApiErrorCode =
  | "bad_request"
  | "invalid_phone"
  | "invalid_code"
  | "code_expired"
  | "rate_limited"
  | "provider_unavailable"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "trip_ended"
  | "realtime_disabled"
  | "server_error";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

export function fail(code: ApiErrorCode, status: number, extraHeaders?: Record<string, string>) {
  return Response.json({ ok: false, error: { code } }, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/** Maps a service AppError (or anything else) to a safe JSON error response. */
export function failFromError(err: unknown) {
  if (err instanceof AppError) {
    if (err.code === "forbidden") return fail("forbidden", 403);
    if (err.code === "not_found") return fail("not_found", 404);
    if (err.reason === "tripEnded") return fail("trip_ended", 409);
    if (err.code === "conflict") return fail("conflict", 409);
    return fail("bad_request", 400);
  }
  console.error("[api] unexpected error", (err as Error)?.name);
  return fail("server_error", 500);
}
