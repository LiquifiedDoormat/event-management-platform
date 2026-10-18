import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Normalizes a user-entered phone number to E.164 (e.g. "+919876543210").
 * Numbers without a country code are treated as Indian. Indian numbers must be
 * mobile numbers, since login uses SMS OTP. Returns null if invalid.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, "IN");
  if (!parsed || !parsed.isValid()) return null;
  if (parsed.country === "IN" && parsed.getType() !== "MOBILE") return null;
  return parsed.number;
}

/** Masks all but the last four digits, for logs and confirmations. */
export function maskPhone(e164: string): string {
  return e164.replace(/\d(?=\d{4})/g, "•");
}
