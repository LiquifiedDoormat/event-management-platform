import "server-only";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { SessionUser } from "@/lib/auth/session";
import { fieldErrors, formToObject } from "@/lib/validation/common";
import { AppError } from "@/server/errors";
import type { ActionState } from "@/features/admin/action-state";

/** Return a path to redirect to, or nothing. */
export type Handler = (user: SessionUser, data: Record<string, string>) => Promise<string | void>;

/**
 * Wraps a handler with auth, error mapping and page refresh. If the handler
 * returns a path, the user is redirected there (locale-aware).
 */
export async function run(form: FormData, handler: Handler): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "errors.unauthenticated" };
  let target: Awaited<ReturnType<Handler>>;
  try {
    target = await handler(user, formToObject(form));
  } catch (err) {
    if (err instanceof z.ZodError) return { status: "error", message: "forms.fixErrors", fieldErrors: fieldErrors(err) };
    if (err instanceof AppError) {
      return { status: "error", message: err.reason ? `errors.reasons.${err.reason}` : `errors.${err.code}` };
    }
    console.error("[action] failed", (err as Error).name); // no message: may contain personal data
    return { status: "error", message: "errors.generic" };
  }
  revalidatePath("/", "layout");
  if (target) redirect({ href: target, locale: await getLocale() });
  return { status: "ok", message: "forms.saved" };
}

