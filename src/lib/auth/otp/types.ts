export type OtpSendResult = { ok: true } | { ok: false; reason: "unavailable" | "rate_limited" };

export type OtpCheckResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "unavailable" | "rate_limited" };

/**
 * Phone OTP provider. Implementations generate, deliver and verify codes; the app
 * never stores codes itself (except the hashed in-memory dev provider).
 * Phone numbers are always E.164.
 */
export interface OtpProvider {
  readonly name: string;
  send(phone: string): Promise<OtpSendResult>;
  check(phone: string, code: string): Promise<OtpCheckResult>;
}
