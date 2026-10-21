import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { getAttendanceTrail, getBusManifest, recordBoarding, recordCheckInOut } from "@/server/services/attendance";
import { createTwoHotels, hasTestDb, resetDb, staff } from "./helpers";

async function rejects(p: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

describe.skipIf(!hasTestDb)("attendance service", () => {
  beforeEach(resetDb);

  it("lets staff check an attendee in and out; coordinators and attendees can't", async () => {
    const { coordA, guestA } = await createTwoHotels();
    const admin = await staff("ADMIN");
    await rejects(recordCheckInOut(coordA, { userId: guestA.id, type: "CHECK_IN" }), "forbidden");
    await rejects(recordCheckInOut(guestA, { userId: guestA.id, type: "CHECK_IN" }), "forbidden");

    await recordCheckInOut(admin, { userId: guestA.id, type: "CHECK_IN" });
    expect((await getAttendanceTrail(admin, guestA.id)).status.checkedIn).toBe(true);

    await recordCheckInOut(admin, { userId: guestA.id, type: "CHECK_OUT" });
    const trail = await getAttendanceTrail(admin, guestA.id);
    expect(trail.status.checkedIn).toBe(false);
    expect(trail.events).toHaveLength(2); // append-only: both events kept, newest first
    expect(trail.events[0].type).toBe("CHECK_OUT");
  });

  it("lets a bus's own coordinator record boarding/departure, not another coordinator's bus", async () => {
    const { coordA, coordB, busA, guestA } = await createTwoHotels();
    await rejects(recordBoarding(coordB, { userId: guestA.id, busId: busA.id, type: "BOARD" }), "forbidden");

    await recordBoarding(coordA, { userId: guestA.id, busId: busA.id, type: "BOARD" });
    const manifest = await getBusManifest(coordA, busA.id);
    expect(manifest.attendees.find((a) => a.id === guestA.id)?.boarded).toBe(true);

    await recordBoarding(coordA, { userId: guestA.id, busId: busA.id, type: "DEPART" });
    expect((await getBusManifest(coordA, busA.id)).attendees.find((a) => a.id === guestA.id)?.boarded).toBe(false);
  });

  it("refuses to board an attendee onto a bus outside their hotel, even for staff", async () => {
    const { busA, guestB } = await createTwoHotels();
    const admin = await staff("ADMIN");
    await rejects(recordBoarding(admin, { userId: guestB.id, busId: busA.id, type: "BOARD" }), "invalid", "attendeeWrongHotel");
  });

  it("scopes trail visibility like canViewPerson: self, own hotel's coordinator, staff — not an unrelated attendee", async () => {
    const { coordA, coordB, guestA, guestB } = await createTwoHotels();
    const admin = await staff("ADMIN");
    await recordCheckInOut(admin, { userId: guestA.id, type: "CHECK_IN" });

    await expect(getAttendanceTrail(guestA, guestA.id)).resolves.toBeDefined();
    await expect(getAttendanceTrail(coordA, guestA.id)).resolves.toBeDefined();
    await rejects(getAttendanceTrail(coordB, guestA.id), "forbidden");
    await rejects(getAttendanceTrail(guestB, guestA.id), "forbidden");
  });
});
