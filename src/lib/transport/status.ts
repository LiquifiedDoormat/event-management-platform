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

/** Badge tone per status kind — reached/green, travelling/blue, boarding/mustard. */
export const STATUS_BADGE_TONE: Record<StatusKind, "ok" | "info" | "warn"> = {
  arrived: "ok",
  moving: "info",
  boarding: "warn",
};

/**
 * Full-row background per status kind, for dashboard/list views (bus ops board,
 * buses directory). A delayed trip uses DELAYED_ROW_STYLE instead, regardless
 * of kind — delayed is the more urgent signal and should stand out on its own,
 * not blend into whichever leg the bus happens to be on.
 */
export const STATUS_ROW_STYLE: Record<StatusKind, string> = {
  boarding: "bg-amber-50 border-warn",
  moving: "bg-blue-50 border-info",
  arrived: "bg-green-50 border-ok",
};

/** Same colour used for the "Delayed" badge — a dedicated red, no longer shared with "boarding". */
export const DELAYED_ROW_STYLE = "bg-red-50 border-danger";

/** Text colour matching STATUS_ROW_STYLE's border, for panels that tint the status label itself. */
export const STATUS_TEXT_CLASS: Record<StatusKind, string> = {
  boarding: "text-warn",
  moving: "text-info",
  arrived: "text-ok",
};

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
