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
  | "server_error";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

export function fail(code: ApiErrorCode, status: number, extraHeaders?: Record<string, string>) {
  return Response.json({ ok: false, error: { code } }, { status, headers: { ...NO_STORE, ...extraHeaders } });
}
