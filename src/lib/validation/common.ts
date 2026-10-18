import { z } from "zod";
import { normalizePhone } from "@/lib/utils/phone";

// Shared field schemas. Form inputs arrive as strings; empty strings mean "not set".

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const requiredText = (max: number) => z.string().trim().min(1, "required").max(max, "tooLong");

export const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, "tooLong").optional());

export const optionalId = z.preprocess(emptyToUndefined, z.string().min(1).max(40).optional());

const coordinate = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number({ error: "invalidNumber" }).min(min, "outOfRange").max(max, "outOfRange").optional());

/** Optional latitude/longitude pair: both or neither. */
export const coordinates = {
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
};

export function bothOrNeither(v: { latitude?: number; longitude?: number }) {
  return (v.latitude === undefined) === (v.longitude === undefined);
}

export const phone = z
  .string()
  .trim()
  .min(1, "required")
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return normalized;
  });

/** Turns FormData into a plain object for Zod (single values only). */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

/** Zod issues → { field: messageKey } for showing next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    out[key] ??= issue.message in KNOWN ? issue.message : "invalid";
  }
  return out;
}

const KNOWN: Record<string, true> = {
  required: true,
  tooLong: true,
  invalidNumber: true,
  outOfRange: true,
  invalidPhone: true,
  coordsPair: true,
  invalid: true,
};

export const listQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  cursor: z.string().max(40).optional().catch(undefined),
});
