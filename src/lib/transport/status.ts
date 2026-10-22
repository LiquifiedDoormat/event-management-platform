import type { BusStatus } from "@/generated/prisma/enums";

/** Coarse grouping shown prominently to attendees: is the bus boarding, moving or there? */
export type StatusKind = "boarding" | "moving" | "arrived";

export const STATUS_KIND: Record<BusStatus, StatusKind> = {
  BOARDING_AT_VENUE: "boarding",
  DEPARTED_VENUE: "moving",
  ARRIVED_AT_HOTEL: "arrived",
  BOARDING_AT_HOTEL: "boarding",
  DEPARTED_HOTEL: "moving",
  ARRIVED_AT_VENUE: "arrived",
};

/** The two valid starting legs for a trip (see services/trips.ts). */
export const START_STATUSES = ["BOARDING_AT_VENUE", "BOARDING_AT_HOTEL"] as const satisfies readonly BusStatus[];

export const STATUS_ICON: Record<StatusKind, string> = { boarding: "🧍", moving: "🚌", arrived: "📍" };

export type Freshness = "live" | "stale" | "none";

/**
 * Whether a bus position can be shown as current. Anything older than the
 * event's stale threshold is "stale" and must be labelled as such, never shown
 * as the bus's present location.
 */
export function locationFreshness(recordedAt: Date | null | undefined, staleSeconds: number, now = Date.now()): Freshness {
  if (!recordedAt) return "none";
  return now - recordedAt.getTime() <= staleSeconds * 1000 ? "live" : "stale";
}
