import { maskPhone } from "@/lib/utils/phone";
import { randomDigits, safeEqual, sha256 } from "@/lib/utils/crypto";
import type { OtpProvider } from "./types";

// Local development / test provider. Codes are printed to the server console
// instead of sent by SMS. Refused in production by src/config/env.ts.
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Entry = { hash: string; expiresAt: number; attempts: number };
const store = ((globalThis as { __devOtpStore?: Map<string, Entry> }).__devOtpStore ??= new Map());
let lastCode: { phone: string; code: string } | undefined;

export const devOtpProvider: OtpProvider = {
  name: "dev",

  async send(phone) {
    const code = randomDigits(6);
    store.set(phone, { hash: sha256(code), expiresAt: Date.now() + TTL_MS, attempts: 0 });
    lastCode = { phone, code };
    console.info(`[dev-otp] code for ${maskPhone(phone)}: ${code}`);
    return { ok: true };
  },

  async check(phone, code) {
    const entry = store.get(phone);
    if (!entry || entry.expiresAt < Date.now()) {
      store.delete(phone);
      return { ok: false, reason: "expired" };
    }
    if (++entry.attempts > MAX_ATTEMPTS) {
      store.delete(phone);
      return { ok: false, reason: "expired" };
    }
    if (!safeEqual(entry.hash, sha256(code))) return { ok: false, reason: "invalid" };
    store.delete(phone);
    return { ok: true };
  },
};

/** Test helper: the most recent code sent to `phone`. */
export function devLastCodeFor(phone: string): string | undefined {
  return lastCode?.phone === phone ? lastCode.code : undefined;
}

/** Test helper: force a code to expire. */
export function devExpireCode(phone: string) {
  const entry = store.get(phone);
  if (entry) entry.expiresAt = 0;
}
