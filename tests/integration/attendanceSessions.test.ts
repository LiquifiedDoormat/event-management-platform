import { beforeEach, describe, expect, it } from "vitest";
import { clusterInput } from "@/lib/validation/entities";
import * as clusters from "@/server/services/clusters";
import * as sessions from "@/server/services/attendanceSessions";
import { AppError } from "@/server/errors";
import { createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function expectError(promise: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

const day1 = new Date("2026-11-01");

describe.skipIf(!hasTestDb)("attendance sessions", () => {
  beforeEach(resetDb);

  it("the bus's own coordinator creates a session and marks guests, with counts derived correctly", async () => {
    const { busA, coordA, guestA } = await createTwoHotels();
    const session = await sessions.createSession(coordA, { busId: busA.id, date: day1, label: "" });
    let detail = await sessions.getSession(coordA, session.id);
    expect(detail.canEdit).toBe(true);
    expect(detail.summary).toEqual({ total: 1, boarded: 0, absent: 0 });

    await sessions.recordMark(coordA, { sessionId: session.id, userId: guestA.id, mark: "BOARDED", note: null, expectedVersion: 0 });
    detail = await sessions.getSession(coordA, session.id);
    expect(detail.summary).toEqual({ total: 1, boarded: 1, absent: 0 });
    expect(detail.roster[0].record?.mark).toBe("BOARDED");

    // Re-mark the same guest absent with a note; version must have advanced.
    const version = detail.roster[0].record!.version;
    await sessions.recordMark(coordA, { sessionId: session.id, userId: guestA.id, mark: "ABSENT", note: "Sick", expectedVersion: version });
    detail = await sessions.getSession(coordA, session.id);
    expect(detail.summary).toEqual({ total: 1, boarded: 0, absent: 1 });
    expect(detail.roster[0].record?.note).toBe("Sick");
  });

  it("rejects an exact duplicate session (same bus, date, label) but allows a different label", async () => {
    const { busA, coordA } = await createTwoHotels();
    await sessions.createSession(coordA, { busId: busA.id, date: day1, label: "" });
    await expectError(sessions.createSession(coordA, { busId: busA.id, date: day1, label: "" }), "conflict", "duplicateSession");
    // A distinct label for the same day is a deliberate second session, not a duplicate.
    await expect(sessions.createSession(coordA, { busId: busA.id, date: day1, label: "Evening" })).resolves.toBeTruthy();
  });

  it("rejects a stale mark instead of silently overwriting a concurrent edit", async () => {
    const { busA, coordA, guestA } = await createTwoHotels();
    const session = await sessions.createSession(coordA, { busId: busA.id, date: day1, label: "" });
    // First mark creates the record (starts at version 0).
    const created = await sessions.recordMark(coordA, { sessionId: session.id, userId: guestA.id, mark: "BOARDED", note: null, expectedVersion: 0 });
    expect(created.version).toBe(0);
    // Two devices both load the record at version 0 and edit concurrently.
    const first = await sessions.recordMark(coordA, { sessionId: session.id, userId: guestA.id, mark: "ABSENT", note: "Device A", expectedVersion: 0 });
    expect(first.version).toBe(1);
    await expectError(
      sessions.recordMark(coordA, { sessionId: session.id, userId: guestA.id, mark: "BOARDED", note: null, expectedVersion: 0 }),
      "conflict",
      "staleAttendance",
    );
    // The first device's edit is the one that stuck.
    const detail = await sessions.getSession(coordA, session.id);
    expect(detail.roster[0].record).toMatchObject({ mark: "ABSENT", note: "Device A", version: 1 });
  });

  it("a cluster coordinator gets the same operational access as a hotel coordinator across their cluster's buses, including editing sessions", async () => {
    const owner = await staff("OWNER");
    const { eventId, busA, coordA, guestA } = await createTwoHotels();
    const north = await clusters.createCluster(owner, clusterInput.parse({ name: "North" }));
    const hotelAId = (await sessions.listSessions(owner, busA.id)).bus.hotelId;
    await clusters.addClusterHotel(owner, north.id, hotelAId);
    const cc = await createUser("CLUSTER_COORDINATOR", { eventId });
    await clusters.addClusterCoordinator(owner, north.id, cc.id);

    const session = await sessions.createSession(coordA, { busId: busA.id, date: day1, label: "" });
    const detail = await sessions.getSession(cc, session.id);
    expect(detail.canEdit).toBe(true);
    expect(detail.roster.some((r) => r.user.id === guestA.id)).toBe(true);
    const marked = await sessions.recordMark(cc, { sessionId: session.id, userId: guestA.id, mark: "BOARDED", note: null, expectedVersion: 0 });
    expect(marked.version).toBe(0); // brand-new record: version starts at 0, nothing to increment yet

  });

  it("a coordinator of a different hotel's bus cannot view or edit the session", async () => {
    const { busA, coordA, coordB } = await createTwoHotels();
    const session = await sessions.createSession(coordA, { busId: busA.id, date: day1, label: "" });
    await expectError(sessions.getSession(coordB, session.id), "not_found");
    await expectError(sessions.createSession(coordB, { busId: busA.id, date: day1, label: "Attempt" }), "forbidden");
  });
});
