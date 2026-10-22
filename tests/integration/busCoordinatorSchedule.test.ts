import { beforeEach, describe, expect, it } from "vitest";
import * as schedule from "@/server/services/busCoordinatorSchedule";
import { AppError } from "@/server/errors";
import { createTwoHotels, createUser, hasTestDb, resetDb, staff } from "./helpers";

async function expectError(promise: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

const d = (s: string) => new Date(s);

describe.skipIf(!hasTestDb)("bus coordinator schedule", () => {
  beforeEach(resetDb);

  it("an owner schedules a coordinator for a date range and can list/remove it", async () => {
    const owner = await staff("OWNER");
    const { eventId, busA, hotelA } = await createTwoHotels();
    const substitute = await createUser("COORDINATOR", { eventId, hotelId: hotelA.id });
    const created = await schedule.scheduleAssignment(owner, {
      busId: busA.id,
      coordinatorId: substitute.id,
      startsOn: d("2026-12-01"),
      endsOn: d("2026-12-10"),
      notes: "Covering while the regular coordinator travels",
    });
    expect(created.id).toBeTruthy();
    const list = await schedule.listAssignments(owner, busA.id);
    expect(list).toHaveLength(1);
    expect(list[0].coordinator.id).toBe(substitute.id);

    await schedule.removeAssignment(owner, created.id);
    expect(await schedule.listAssignments(owner, busA.id)).toHaveLength(0);
  });

  it("rejects an overlapping schedule for the same bus but allows adjacent, non-overlapping ranges", async () => {
    const owner = await staff("OWNER");
    const { eventId, busA, hotelA } = await createTwoHotels();
    const a = await createUser("COORDINATOR", { eventId, hotelId: hotelA.id });
    const b = await createUser("COORDINATOR", { eventId, hotelId: hotelA.id });

    await schedule.scheduleAssignment(owner, { busId: busA.id, coordinatorId: a.id, startsOn: d("2026-12-01"), endsOn: d("2026-12-10"), notes: "" });

    // Fully inside the existing range.
    await expectError(
      schedule.scheduleAssignment(owner, { busId: busA.id, coordinatorId: b.id, startsOn: d("2026-12-05"), endsOn: d("2026-12-06"), notes: "" }),
      "conflict",
      "overlappingAssignment",
    );
    // Starts before and ends inside.
    await expectError(
      schedule.scheduleAssignment(owner, { busId: busA.id, coordinatorId: b.id, startsOn: d("2026-11-25"), endsOn: d("2026-12-02"), notes: "" }),
      "conflict",
      "overlappingAssignment",
    );
    // Open-ended, starting inside the existing range.
    await expectError(
      schedule.scheduleAssignment(owner, { busId: busA.id, coordinatorId: b.id, startsOn: d("2026-12-08"), endsOn: null, notes: "" }),
      "conflict",
      "overlappingAssignment",
    );
    // Starts the day after the existing range ends -- adjacent, not overlapping.
    await expect(
      schedule.scheduleAssignment(owner, { busId: busA.id, coordinatorId: b.id, startsOn: d("2026-12-11"), endsOn: null, notes: "" }),
    ).resolves.toBeTruthy();
  });

  it("rejects an end date before the start date", async () => {
    const owner = await staff("OWNER");
    const { eventId, busA, hotelA } = await createTwoHotels();
    const coord = await createUser("COORDINATOR", { eventId, hotelId: hotelA.id });
    await expectError(
      schedule.scheduleAssignment(owner, { busId: busA.id, coordinatorId: coord.id, startsOn: d("2026-12-10"), endsOn: d("2026-12-01"), notes: "" }),
      "conflict",
      "endBeforeStart",
    );
  });

  it("is owner-only, like assigning the bus's own coordinator", async () => {
    const admin = await staff("ADMIN");
    const { busA, coordA } = await createTwoHotels();
    await expectError(
      schedule.scheduleAssignment(admin, { busId: busA.id, coordinatorId: coordA.id, startsOn: d("2026-12-01"), endsOn: null, notes: "" }),
      "forbidden",
    );
    await expectError(schedule.listAssignments(coordA, busA.id), "forbidden");
  });
});
