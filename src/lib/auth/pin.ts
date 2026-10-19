import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { sha256 } from "@/lib/utils/crypto";

// 6-digit PINs for Owner/Admin/Coordinator accounts.
// Stored as scrypt hashes (memory-hard, salted); never stored or logged in plain text.
// A 6-digit PIN has only 1,000,000 combinations, so brute force is limited by
// per-account lockout and per-phone/IP rate limits (see services/auth.ts).

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function scrypt(pin: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pin, salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(pin, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const PIN_PATTERN = /^\d{6}$/;

/** Rejects the most guessable PINs: one repeated digit, or straight runs like 123456/654321. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

// One-time setup codes: issued by an authorized admin, handed over in person
// or by private message, used once to set a new PIN. Stored as SHA-256 (high
// entropy, so a fast hash is fine), expire after SETUP_CODE_DAYS.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
export const SETUP_CODE_DAYS = 7;

export function newSetupCode(): string {
  const chars = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Normalises user input (case, spaces, dashes) before hashing. */
export function hashSetupCode(code: string): string {
  return sha256(code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
}
