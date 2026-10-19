"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import type { ActionState } from "@/features/admin/action-state";

// The only personal detail users may change themselves is their preferred
// language. Name, phone and hotel are managed by staff.
const locale = z.enum(["en", "hi"]);

export async function updateLanguageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "errors.unauthenticated" };
  const parsed = locale.safeParse(form.get("preferredLocale"));
  if (!parsed.success) return { status: "error", message: "errors.invalid" };
  await prisma.user.update({ where: { id: user.id }, data: { preferredLocale: parsed.data } });
  revalidatePath("/", "layout");
  // Show the profile page in the newly chosen language (also stores the language cookie).
  redirect({ href: "/profile?saved=1", locale: parsed.data });
  return { status: "ok" };
}
