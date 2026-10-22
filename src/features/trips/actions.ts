"use server";

// Trip Server Actions. Form actions (staff bus page) use `run`; the coordinator's
// trip screen calls the typed actions directly from the client.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppError } from "@/server/errors";
import * as trips from "@/server/services/trips";
import { run } from "@/features/run-action";
import type { ActionState } from "@/features/admin/action-state";

const id = z.string().min(1).max(40);
const status = z.enum(["BOARDING_AT_VENUE", "DEPARTED_VENUE", "ARRIVED_AT_HOTEL", "BOARDING_AT_HOTEL", "DEPARTED_HOTEL", "ARRIVED_AT_VENUE"]);
const startStatus = z.enum(["BOARDING_AT_VENUE", "BOARDING_AT_HOTEL"]);

export type TripResult = { ok: true; version?: number } | { ok: false; message: string };

async function direct(fn: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<number | void>): Promise<TripResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "errors.unauthenticated" };
  try {
    const version = await fn(user);
    revalidatePath("/", "layout");
    return { ok: true, ...(typeof version === "number" ? { version } : {}) };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: "errors.invalid" };
    if (err instanceof AppError) return { ok: false, message: err.reason ? `errors.reasons.${err.reason}` : `errors.${err.code}` };
    console.error("[trip action] failed", (err as Error).name);
    return { ok: false, message: "errors.generic" };
  }
}

// ---- Called from the coordinator trip screen ------------------------------

export async function changeStatusDirect(tripId: string, next: string, expectedVersion: number) {
  return direct(async (u) => (await trips.changeStatus(u, id.parse(tripId), status.parse(next), z.number().int().min(0).parse(expectedVersion))).version);
}

export async function setSharingDirect(tripId: string, sharing: boolean) {
  return direct((u) => trips.setSharing(u, id.parse(tripId), z.boolean().parse(sharing)));
}

export async function setDelayedDirect(tripId: string, delayed: boolean) {
  return direct((u) => trips.setTripDelayed(u, id.parse(tripId), z.boolean().parse(delayed)));
}

export async function endTripDirect(tripId: string) {
  return direct((u) => trips.endTrip(u, id.parse(tripId)));
}

export async function cancelTripDirect(tripId: string) {
  return direct((u) => trips.cancelTrip(u, id.parse(tripId)));
}

// ---- Form actions ---------------------------------------------------------

/** Coordinators are taken straight to the trip controls; staff stay on the bus page. */
export async function startTripAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => {
    const trip = await trips.startTrip(u, id.parse(d.busId), startStatus.parse(d.startStatus));
    return u.role === "COORDINATOR" ? `/coordinator/trip/${trip.id}` : undefined;
  });
}

export async function endTripAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => trips.endTrip(u, id.parse(d.tripId)));
}

export async function cancelTripAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => trips.cancelTrip(u, id.parse(d.tripId)));
}

export async function setDelayedAction(_: ActionState, form: FormData) {
  return run(form, (u, d) => trips.setTripDelayed(u, id.parse(d.tripId), d.delayed === "true"));
}

export async function correctStatusAction(_: ActionState, form: FormData) {
  return run(form, async (u, d) => {
    await trips.changeStatus(u, id.parse(d.tripId), status.parse(d.status), z.coerce.number().int().min(0).parse(d.version));
  });
}
