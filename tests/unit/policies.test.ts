import { describe, expect, it } from "vitest";
import { assignableRoles, can, canChangeStatus, canEditPerson, canViewPerson, type Action, type Actor, type Scope } from "@/server/policies";

const owner: Actor = { id: "o", role: "OWNER", hotelId: null };
const admin: Actor = { id: "a", role: "ADMIN", hotelId: null };
const coord: Actor = { id: "c", role: "COORDINATOR", hotelId: null };
const clusterCoord: Actor = { id: "cc", role: "CLUSTER_COORDINATOR", hotelId: null };
const guest: Actor = { id: "g", role: "CUSTOMER", hotelId: "h1" };

const OWNER_ONLY: Action[] = [
  "hotel.deactivate",
  "bus.deactivate",
  "bus.reassignHotel",
  "bus.assignCoordinator",
  "person.deactivate",
  "person.reassignHotel",
  "person.changeRole",
  "audit.view",
  "config.update",
];

describe("role permissions", () => {
  it.each(OWNER_ONLY)("only the owner may %s", (action) => {
    expect(can(owner, action)).toBe(true);
    expect(can(admin, action)).toBe(false);
    expect(can(coord, action)).toBe(false);
    expect(can(guest, action)).toBe(false);
  });

  it("admins manage operational records", () => {
    for (const a of ["hotel.create", "hotel.update", "bus.create", "bus.editStops", "person.create"] as Action[]) {
      expect(can(admin, a)).toBe(true);
    }
  });

  it("admins may manage a hotel's coordinator roster and clusters (not owner-only)", () => {
    for (const a of ["hotel.manageCoordinators", "cluster.create", "cluster.update", "cluster.manageHotels", "cluster.manageCoordinators"] as Action[]) {
      expect(can(admin, a)).toBe(true);
      expect(can(coord, a)).toBe(false);
      expect(can(clusterCoord, a)).toBe(false);
    }
  });

  it("only the owner may grant the CLUSTER_COORDINATOR role", () => {
    expect(assignableRoles(owner)).toContain("CLUSTER_COORDINATOR");
    expect(assignableRoles(admin)).not.toContain("CLUSTER_COORDINATOR");
  });

  it("customers and coordinators have no management actions", () => {
    expect(can(guest, "dashboard.viewAll")).toBe(false);
    expect(can(coord, "hotel.update")).toBe(false);
  });

  it("nobody can grant OWNER through the app; admins can grant only CUSTOMER", () => {
    expect(assignableRoles(owner)).not.toContain("OWNER");
    expect(assignableRoles(admin)).toEqual(["CUSTOMER"]);
    expect(assignableRoles(coord)).toEqual([]);
    expect(assignableRoles(guest)).toEqual([]);
  });

  it("admins cannot edit other staff, including themselves into owners", () => {
    expect(canEditPerson(admin, { id: "a", role: "ADMIN" })).toBe(false);
    expect(canEditPerson(admin, { id: "o", role: "OWNER" })).toBe(false);
    expect(canEditPerson(admin, { id: "g", role: "CUSTOMER" })).toBe(true);
    expect(canEditPerson(owner, { id: "o2", role: "OWNER" })).toBe(false);
    expect(canEditPerson(owner, { id: "a", role: "ADMIN" })).toBe(true);
  });
});

describe("cluster coordinator visibility", () => {
  const scope: Scope = { hotelIds: new Set(["h1"]), operableBusIds: new Set() };
  it("sees attendees and hotel coordinators of hotels in their cluster, nothing outside it", () => {
    expect(canViewPerson(clusterCoord, scope, { id: "guest", role: "CUSTOMER", hotelId: "h1" })).toBe(true);
    expect(canViewPerson(clusterCoord, scope, { id: "hc", role: "COORDINATOR", hotelId: "h1" })).toBe(true);
    expect(canViewPerson(clusterCoord, scope, { id: "other", role: "CUSTOMER", hotelId: "h2" })).toBe(false);
    expect(canViewPerson(clusterCoord, scope, { id: "unassigned", role: "CUSTOMER", hotelId: null })).toBe(false);
  });

  it("never operates buses (view only)", () => {
    expect(scope.operableBusIds.size).toBe(0);
  });
});

describe("bus status changes", () => {
  const trip = { coordinatorId: "c", endedAt: null };
  it("allows the trip coordinator and staff corrections only", () => {
    expect(canChangeStatus(coord, trip)).toBe(true);
    expect(canChangeStatus({ ...coord, id: "other" }, trip)).toBe(false);
    expect(canChangeStatus(admin, trip)).toBe(true);
    expect(canChangeStatus(guest, trip)).toBe(false);
    expect(canChangeStatus(coord, { ...trip, endedAt: new Date() })).toBe(false);
  });
});
