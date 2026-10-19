"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getCurrentSession } from "@/lib/auth/current-user";
import { roleHome } from "@/server/services/auth";
import * as events from "@/server/services/events";
import { run } from "@/features/run-action";
import type { ActionState } from "@/features/admin/action-state";

const id = z.string().min(1).max(40);

/** Server-authorized event switch; lands on the role's home page in the new event. */
export async function switchEventAction(form: FormData) {
  const session = await getCurrentSession();
  if (!session) return;
  const eventId = id.safeParse(form.get("eventId"));
  if (eventId.success) {
    try {
      await events.switchEvent(session.user, session.sessionId, eventId.data);
    } catch {
      // Not allowed: stay in the current event.
    }
  }
  revalidatePath("/", "layout");
  redirect({ href: roleHome(session.user.role), locale: await getLocale() });
}

export async function createEventAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => `/events/${(await events.createEvent(u, events.eventInput.parse(d))).id}`);
}

export async function updateEventAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => events.updateEvent(u, id.parse(d.id), events.eventInput.parse(d)));
}

export async function setEventActiveAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => events.setEventActive(u, id.parse(d.id), d.active === "true"));
}
