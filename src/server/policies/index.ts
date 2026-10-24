import type { Role } from "@/generated/prisma/client";

// Authorization rules, as pure functions. Every server entry point must call
// these (after authenticating) before reading or changing data. See docs/SECURITY.md
// for the permission matrix in prose.

/**
 * The signed-in user as seen by policies. `eventId` is the event selected in the
 * session (re-validated per request); `hotelId` is an attendee's hotel in that event.
 */
export type Actor = { id: string; role: Role; hotelId?: string | null; eventId?: string | null };

/**
 * What a non-staff user is allowed to see/operate, loaded by `loadScope`.
 * A hotel coordinator's scope is their one hotel, `operableBusIds` their own
 * designated bus(es). A cluster coordinator's scope is every hotel in their
 * cluster, with `operableBusIds` covering every active bus across those
 * hotels — not just one of their own, since they have none — giving them the
 * same operational actions (trip management, boarding/attendance, GPS) as a
 * hotel coordinator would have, but across their whole cluster.
 */
export type Scope = {
  /** Hotels whose details, coordinators and buses the actor may view. */
  hotelIds: ReadonlySet<string>;
  /** Buses the actor may operate (status + GPS). Hotel coordinators only. */
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
  | "hotel.manageCoordinators"
  | "cluster.create"
  | "cluster.update"
  | "cluster.manageHotels"
  | "cluster.manageCoordinators"
  | "zone.create"
  | "zone.update"
  | "zone.deactivate"
  | "zone.manageGates"
  | "zone.manageAssignments"
  | "room.manage"
  | "room.manageAssignments"
  | "attendance.checkInOut"
  | "bus.create"
  | "bus.update"
  | "bus.editStops"
  | "bus.deactivate"
  | "bus.reassignHotel"
  | "bus.assignCoordinator"
  | "person.create"
  | "person.update"
  | "person.deactivate"
  | "person.reassignHotel"
  | "person.changeRole"
  | "trip.manage"
  | "trip.correctStatus"
  | "audit.view"
  | "config.update"
  | "event.create"
  | "event.update"
  | "event.deactivate";

const ADMIN_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "dashboard.viewAll",
  "hotel.create",
  "hotel.update",
  // A hotel's coordinator roster is now a many-to-many membership, not a single
  // scarce slot (unlike bus.assignCoordinator, which still picks the one person
  // responsible for a bus), so it's provisioning work like person.create, not an
  // Owner-only reassignment.
  "hotel.manageCoordinators",
  "cluster.create",
  "cluster.update",
  "cluster.manageHotels",
  "cluster.manageCoordinators",
  // Zone/gate management and attendee zone assignment are ordinary provisioning
  // (like hotel.manageCoordinators above), not a scarce 1:1 resource swap.
  "zone.create",
  "zone.update",
  "zone.deactivate",
  "zone.manageGates",
  "zone.manageAssignments",
  // Same provisioning rationale as the zone actions just above.
  "room.manage",
  "room.manageAssignments",
  // Venue check-in/out is a staff (gate-desk) action; boarding/departure is
  // recorded by the trip's own coordinator — see canRecordBoarding below.
  "attendance.checkInOut",
  "bus.create",
  "bus.update",
  "bus.editStops",
  "person.create",
  "person.update",
  "trip.manage",
  "trip.correctStatus",
  "event.create",
  "event.update",
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
  if (actor.role === "OWNER") return ["ADMIN", "CLUSTER_COORDINATOR", "COORDINATOR", "CUSTOMER"];
  if (actor.role === "ADMIN") return ["CUSTOMER"];
  return [];
}

/**
 * Attendee hotel allotment: the Owner may change it at any time; an Admin may
 * only make the first allotment (when the attendee has no hotel yet).
 */
export function canSetAttendeeHotel(actor: Actor, currentHotelId: string | null): boolean {
  return can(actor, "person.reassignHotel") || (actor.role === "ADMIN" && currentHotelId === null);
}

/**
 * PIN resets (issue a new one-time setup code): Owner for Admins and
 * Coordinators; Admins for Coordinators. Owners recover via the CLI script.
 * Attendees have no PIN.
 */
export function canResetPin(actor: Actor, target: { id: string; role: Role }): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === "OWNER") return target.role === "ADMIN" || target.role === "CLUSTER_COORDINATOR" || target.role === "COORDINATOR";
  if (actor.role === "ADMIN") return target.role === "CLUSTER_COORDINATOR" || target.role === "COORDINATOR";
  return false;
}

/** Admins may edit attendees and (hotel/cluster) coordinators, never other staff. */
export function canEditPerson(actor: Actor, target: { id: string; role: Role }): boolean {
  if (actor.role === "OWNER") return target.role !== "OWNER" || target.id === actor.id;
  if (actor.role === "ADMIN") return target.role === "CUSTOMER" || target.role === "CLUSTER_COORDINATOR" || target.role === "COORDINATOR";
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
 * Person detail pages: staff see everyone; users see themselves; hotel coordinators
 * see attendees of their one hotel; cluster coordinators see attendees and hotel
 * coordinators of hotels in their cluster. Customers see their coordinator only
 * through the hotel view, which exposes name and phone and nothing else.
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
  if (actor.role === "CLUSTER_COORDINATOR") {
    return (
      (target.role === "CUSTOMER" || target.role === "COORDINATOR") && target.hotelId !== null && scope.hotelIds.has(target.hotelId)
    );
  }
  return false;
}

/**
 * An attendee's postal address (PII, more sensitive than name/phone): the
 * attendee themselves, or Owner/Admin — never a hotel/cluster coordinator,
 * even though they can otherwise view the same person's details.
 */
export function canViewAddress(actor: Actor, targetId: string): boolean {
  return isStaff(actor) || actor.id === targetId;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * GPS updates: the coordinator on the bus's active trip, or a cluster
 * coordinator standing in for any bus across their cluster (the same
 * operational reach `operableBusIds` already gives them — see `loadScope`).
 */
export function canSendLocation(actor: Actor, scope: Scope, trip: { busId: string; coordinatorId: string; endedAt: Date | null }): boolean {
  if (trip.endedAt !== null) return false;
  if (actor.role === "COORDINATOR" && trip.coordinatorId === actor.id) return true;
  return actor.role === "CLUSTER_COORDINATOR" && scope.operableBusIds.has(trip.busId);
}

/**
 * Status changes: the trip's coordinator, staff making a correction, or a
 * cluster coordinator correcting any trip across their cluster (same
 * audited "correction" treatment as a staff override, since they were never
 * physically on the bus either).
 */
export function canChangeStatus(actor: Actor, scope: Scope, trip: { busId: string; coordinatorId: string; endedAt: Date | null }): boolean {
  if (trip.endedAt !== null) return false;
  if (can(actor, "trip.correctStatus") || (actor.role === "COORDINATOR" && trip.coordinatorId === actor.id)) return true;
  return actor.role === "CLUSTER_COORDINATOR" && scope.operableBusIds.has(trip.busId);
}

/**
 * Starting/ending a trip: staff, a coordinator for a bus they are designated
 * to, or a cluster coordinator for any bus in their cluster.
 */
export function canStartTrip(actor: Actor, scope: Scope, busId: string): boolean {
  return can(actor, "trip.manage") || ((actor.role === "COORDINATOR" || actor.role === "CLUSTER_COORDINATOR") && scope.operableBusIds.has(busId));
}

/** Boarding/departure attendance events: staff, a coordinator for a bus they operate, or a cluster coordinator for any bus in their cluster. */
export function canRecordBoarding(actor: Actor, scope: Scope, busId: string): boolean {
  return can(actor, "trip.manage") || ((actor.role === "COORDINATOR" || actor.role === "CLUSTER_COORDINATOR") && scope.operableBusIds.has(busId));
}

/** Creating/editing an attendance session's records: same rule as recording boarding. */
export function canManageAttendanceSession(actor: Actor, scope: Scope, busId: string): boolean {
  return canRecordBoarding(actor, scope, busId);
}

/**
 * Viewing attendance sessions for a bus: staff, the cluster coordinator of its
 * hotel's cluster, or the bus's own operating coordinator — the same audience
 * `canViewBus` already allows to see the bus at all.
 */
export function canViewAttendanceSession(actor: Actor, scope: Scope, bus: { hotelId: string }): boolean {
  return canViewBus(actor, scope, bus);
}

/**
 * A guest's medical-needs text: staff, the guest themselves, or the hotel
 * coordinator of their hotel — narrower than canViewPerson (excludes cluster
 * coordinators, who have no reason to act on it) but wider than canViewAddress
 * (coordinators need this one to do their job, unlike a postal address).
 */
export function canEditMedicalNeeds(actor: Actor, scope: Scope, target: { id: string; role: Role; hotelId: string | null }): boolean {
  if (isStaff(actor) || actor.id === target.id) return true;
  return actor.role === "COORDINATOR" && target.role === "CUSTOMER" && target.hotelId !== null && scope.hotelIds.has(target.hotelId);
}

/** Venue check-in/out: staff, or a cluster coordinator for an attendee of a hotel in their cluster. */
export function canCheckInOutAttendee(actor: Actor, scope: Scope, target: { hotelId: string | null }): boolean {
  if (can(actor, "attendance.checkInOut")) return true;
  return actor.role === "CLUSTER_COORDINATOR" && target.hotelId !== null && scope.hotelIds.has(target.hotelId);
}

/** Seating-zone assignment: staff, or a cluster coordinator for an attendee of a hotel in their cluster. */
export function canManageZoneAssignment(actor: Actor, scope: Scope, target: { hotelId: string | null }): boolean {
  if (can(actor, "zone.manageAssignments")) return true;
  return actor.role === "CLUSTER_COORDINATOR" && target.hotelId !== null && scope.hotelIds.has(target.hotelId);
}

/** Room assignment: staff, or a cluster coordinator for an attendee of a hotel in their cluster. */
export function canManageRoomAssignment(actor: Actor, scope: Scope, target: { hotelId: string | null }): boolean {
  if (can(actor, "room.manageAssignments")) return true;
  return actor.role === "CLUSTER_COORDINATOR" && target.hotelId !== null && scope.hotelIds.has(target.hotelId);
}
