import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** URL-safe random token with `bytes` bytes of entropy (default 256 bits). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Uniformly random numeric code, zero-padded. */
export const randomDigits = (length: number) => String(randomInt(0, 10 ** length)).padStart(length, "0");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
