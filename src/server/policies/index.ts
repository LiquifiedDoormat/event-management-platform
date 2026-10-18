import type { Role } from "@/generated/prisma/client";

// Authorization rules, as pure functions. Every server entry point must call
// these (after authenticating) before reading or changing data. See docs/SECURITY.md
// for the permission matrix in prose.

export type Actor = { id: string; role: Role; hotelId: string | null };

/** What a non-staff user is allowed to see/operate, loaded by `loadScope`. */
export type Scope = {
  /** Hotels whose details, coordinator and buses the actor may view. */
  hotelIds: ReadonlySet<string>;
  /** Buses the actor may operate (status + GPS). Coordinators only. */
  operableBusIds: ReadonlySet<string>;
};

export const isStaff = (a: Actor) => a.role === "OWNER" || a.role === "ADMIN";

// ---------------------------------------------------------------------------
// Management actions (role-based). Records are deactivated, never hard-deleted.
// ---------------------------------------------------------------------------

export type Action =
  | "dashboard.viewAll"
  | "hotel.create"
  | "hotel.update"
  | "hotel.deactivate"
  | "hotel.assignCoordinator"
  | "bus.create"
  | "bus.update"
  | "bus.editStops"
  | "bus.deactivate"
  | "bus.reassignHotel"
  | "person.create"
  | "person.update"
  | "person.deactivate"
  | "person.reassignHotel"
  | "person.changeRole"
  | "trip.manage"
  | "trip.correctStatus"
  | "audit.view"
  | "config.update";

const ADMIN_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "dashboard.viewAll",
  "hotel.create",
  "hotel.update",
  "bus.create",
  "bus.update",
  "bus.editStops",
  "person.create",
  "person.update",
  "trip.manage",
  "trip.correctStatus",
]);

export function can(actor: Actor, action: Action): boolean {
  if (actor.role === "OWNER") return true;
  if (actor.role === "ADMIN") return ADMIN_ACTIONS.has(action);
  return false;
}

/**
 * Which roles `actor` may give to a new or existing account.
 * OWNER is never assignable in the app: owners are created only by
 * `scripts/create-owner.ts`. Admins may provision attendees only.
 */
export function assignableRoles(actor: Actor): Role[] {
  if (actor.role === "OWNER") return ["ADMIN", "COORDINATOR", "CUSTOMER"];
  if (actor.role === "ADMIN") return ["CUSTOMER"];
  return [];
}

/** Admins may edit attendees and coordinators, never other staff. */
export function canEditPerson(actor: Actor, target: { id: string; role: Role }): boolean {
  if (actor.role === "OWNER") return target.role !== "OWNER" || target.id === actor.id;
  if (actor.role === "ADMIN") return target.role === "CUSTOMER" || target.role === "COORDINATOR";
  return false;
}

// ---------------------------------------------------------------------------
// Visibility (relationship-based)
// ---------------------------------------------------------------------------

export function canViewHotel(actor: Actor, scope: Scope, hotelId: string): boolean {
  return isStaff(actor) || scope.hotelIds.has(hotelId);
}

export function canViewBus(actor: Actor, scope: Scope, bus: { hotelId: string }): boolean {
  return isStaff(actor) || scope.hotelIds.has(bus.hotelId);
}

/**
 * Person detail pages: staff see everyone; users see themselves; coordinators see
 * attendees of hotels in their scope. Customers see their coordinator only through
 * the hotel view, which exposes name and phone and nothing else.
 */
export function canViewPerson(
  actor: Actor,
  scope: Scope,
  target: { id: string; role: Role; hotelId: string | null },
): boolean {
  if (isStaff(actor) || actor.id === target.id) return true;
  if (actor.role === "COORDINATOR") {
    return target.role === "CUSTOMER" && target.hotelId !== null && scope.hotelIds.has(target.hotelId);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** GPS updates come only from the coordinator on the bus's active trip. */
export function canSendLocation(actor: Actor, trip: { coordinatorId: string; endedAt: Date | null }): boolean {
  return trip.endedAt === null && actor.role === "COORDINATOR" && trip.coordinatorId === actor.id;
}

/** Status changes: the trip's coordinator, or staff making a correction. */
export function canChangeStatus(actor: Actor, trip: { coordinatorId: string; endedAt: Date | null }): boolean {
  if (trip.endedAt !== null) return false;
  return can(actor, "trip.correctStatus") || (actor.role === "COORDINATOR" && trip.coordinatorId === actor.id);
}

/** Starting a trip: staff, or a coordinator for a bus they are designated to. */
export function canStartTrip(actor: Actor, scope: Scope, busId: string): boolean {
  return can(actor, "trip.manage") || (actor.role === "COORDINATOR" && scope.operableBusIds.has(busId));
}
