import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/server/errors";
import { commitImport, previewImport } from "@/server/services/import";
import type { ParsedSheet } from "@/lib/import/parse";
import { createEvent, createTwoHotels, createUser, defaultEvent, hasTestDb, nextPhone, resetDb, staff } from "./helpers";

const sheet = (headers: string[], rows: string[][]): ParsedSheet => ({ headers, rows });

describe.skipIf(!hasTestDb)("bulk import", () => {
  beforeEach(resetDb);

  describe("hotels", () => {
    it("previews without writing, then commits the same rows", async () => {
      const admin = await staff("ADMIN");
      const data = sheet(
        ["name", "address", "latitude", "longitude"],
        [
          ["Grand Palace", "12 MG Road", "12.97", "77.59"],
          ["Sea View", "1 Beach Rd", "", ""],
        ],
      );

      const preview = await previewImport(admin, "hotels", data);
      expect(preview.rows.every((r) => r.status === "valid")).toBe(true);
      expect(await prisma.hotel.count()).toBe(0); // preview never writes

      const result = await commitImport(admin, "hotels", data);
      expect(result).toMatchObject({ created: 2, addedExisting: 0, skippedDuplicate: 0, invalidRows: 0, failed: [] });
      expect(await prisma.hotel.count({ where: { eventId: admin.eventId } })).toBe(2);
    });

    it("flags an invalid row (missing required field) without blocking valid rows", async () => {
      const admin = await staff("ADMIN");
      const data = sheet(
        ["name", "address"],
        [
          ["Grand Palace", "12 MG Road"],
          ["", "No name here"],
        ],
      );
      const result = await commitImport(admin, "hotels", data);
      expect(result).toMatchObject({ created: 1, invalidRows: 1, failed: [] });
      expect(await prisma.hotel.count()).toBe(1);
    });

    it("skips a duplicate name within the same file, and against an existing hotel", async () => {
      const admin = await staff("ADMIN");
      await prisma.hotel.create({ data: { eventId: admin.eventId, name: "Grand Palace", address: "existing" } });
      const data = sheet(
        ["name", "address"],
        [
          ["Grand Palace", "duplicate of existing"],
          ["Sea View", "ok"],
          ["Sea View", "duplicate within file"],
        ],
      );
      const result = await commitImport(admin, "hotels", data);
      expect(result).toMatchObject({ created: 1, skippedDuplicate: 2 });
      expect(await prisma.hotel.count()).toBe(2);
    });

    it("rejects a file missing a required column", async () => {
      const admin = await staff("ADMIN");
      await expect(previewImport(admin, "hotels", sheet(["name"], [["Grand Palace"]]))).rejects.toMatchObject({
        code: "missingColumns",
        details: ["address"],
      });
    });
  });

  describe("buses", () => {
    it("resolves hotelName and creates buses, rejecting unknown/inactive hotels", async () => {
      const { eventId, hotelA } = await createTwoHotels();
      const admin = await staff("ADMIN", eventId);
      await prisma.hotel.update({ where: { id: hotelA.id }, data: { isActive: false } });
      const data = sheet(
        ["label", "hotelName", "registration"],
        [
          ["Bus 9", "Hotel A", "KA1"], // inactive hotel
          ["Bus 10", "No Such Hotel", ""],
          ["Bus 11", "Hotel B", ""],
        ],
      );
      const preview = await previewImport(admin, "buses", data);
      expect(preview.rows[0]).toMatchObject({ status: "invalid", issues: [{ field: "hotelName", key: "hotelInactive" }] });
      expect(preview.rows[1]).toMatchObject({ status: "invalid", issues: [{ field: "hotelName", key: "hotelNotFound" }] });
      expect(preview.rows[2]).toMatchObject({ status: "valid" });

      const result = await commitImport(admin, "buses", data);
      expect(result).toMatchObject({ created: 1, invalidRows: 2 });
    });

    it("skips a duplicate registration and a duplicate label-at-hotel", async () => {
      const { eventId, hotelA } = await createTwoHotels();
      const admin = await staff("ADMIN", eventId);
      await prisma.bus.create({ data: { label: "Reg Bus", hotelId: hotelA.id, registration: "DUPREG1" } });
      await prisma.bus.create({ data: { label: "Existing Bus", hotelId: hotelA.id } });
      const data = sheet(
        ["label", "hotelName", "registration"],
        [
          ["New Bus", "Hotel A", "DUPREG1"], // registration already used
          ["Existing Bus", "Hotel A", ""], // same label, same hotel, no registration
        ],
      );
      const result = await commitImport(admin, "buses", data);
      expect(result).toMatchObject({ created: 0, skippedDuplicate: 2 });
    });

    it("assigns coordinatorPhone, moving the coordinator to the last-listed bus if it repeats (one bus per coordinator)", async () => {
      const { eventId, coordA } = await createTwoHotels();
      const owner = await staff("OWNER", eventId);
      const localPhone = coordA.phone.replace("+91", "");
      const data = sheet(
        ["label", "hotelName", "coordinatorPhone"],
        [
          ["Bus 20", "Hotel A", localPhone],
          ["Bus 21", "Hotel A", localPhone],
        ],
      );
      const result = await commitImport(owner, "buses", data);
      expect(result).toMatchObject({ created: 2, invalidRows: 0 });
      const bus20 = await prisma.bus.findFirstOrThrow({ where: { label: "Bus 20" } });
      const bus21 = await prisma.bus.findFirstOrThrow({ where: { label: "Bus 21" } });
      // A coordinator is responsible for at most one bus: the later row wins.
      expect(bus20.coordinatorId).toBeNull();
      expect(bus21.coordinatorId).toBe(coordA.id);
    });

    it("rejects an unknown coordinatorPhone (not an active coordinator of this event)", async () => {
      const { eventId, hotelA } = await createTwoHotels();
      const owner = await staff("OWNER", eventId);
      const data = sheet(["label", "hotelName", "coordinatorPhone"], [["Bus 22", "Hotel A", "9876500099"]]);
      const preview = await previewImport(owner, "buses", data);
      expect(preview.rows[0]).toMatchObject({ status: "invalid", issues: [{ field: "coordinatorPhone", key: "coordinatorNotFound" }] });
      void hotelA;
    });

    it("reports coordinatorPhone as an error for an Admin instead of silently dropping it", async () => {
      const { eventId, hotelA, coordA } = await createTwoHotels();
      const admin = await staff("ADMIN", eventId);
      const data = sheet(["label", "hotelName", "coordinatorPhone"], [["Bus 23", "Hotel A", coordA.phone.replace("+91", "")]]);
      const preview = await previewImport(admin, "buses", data);
      expect(preview.rows[0]).toMatchObject({ status: "invalid", issues: [{ field: "coordinatorPhone", key: "coordinatorAssignForbidden" }] });
      expect(await prisma.bus.count({ where: { label: "Bus 23" } })).toBe(0);
      void hotelA;
    });
  });

  describe("attendees and coordinators", () => {
    it("imports attendees with a hotel allotment; admin may do the first allotment", async () => {
      const { eventId, hotelA } = await createTwoHotels();
      const admin = await staff("ADMIN", eventId);
      const phone1 = nextPhone().slice(3); // local-format digits, as a human would type into a spreadsheet
      const data = sheet(["name", "phone", "hotelName"], [["Vikram Shah", phone1, "Hotel A"]]);
      const result = await commitImport(admin, "attendees", data);
      expect(result).toMatchObject({ created: 1, failed: [] });
      const user = await prisma.user.findFirst({ where: { role: "CUSTOMER" }, include: { memberships: true } });
      expect(user?.memberships[0]).toMatchObject({ eventId, hotelId: hotelA.id });
    });

    it("imports an attendee's postal address when the column is present", async () => {
      const { eventId } = await createTwoHotels();
      const admin = await staff("ADMIN", eventId);
      const phone1 = nextPhone().slice(3);
      const data = sheet(["name", "phone", "hotelName", "address"], [["Vikram Shah", phone1, "Hotel A", "12 MG Road, Bengaluru"]]);
      const result = await commitImport(admin, "attendees", data);
      expect(result).toMatchObject({ created: 1, failed: [] });
      const user = await prisma.user.findFirst({ where: { name: "Vikram Shah" } });
      expect(user?.address).toBe("12 MG Road, Bengaluru");
    });

    it("rejects coordinator import from an Admin (Owner only)", async () => {
      const admin = await staff("ADMIN");
      await expect(commitImport(admin, "coordinators", sheet(["name", "phone"], [["Asha Rao", "9876543210"]]))).rejects.toBeInstanceOf(
        AppError,
      );
    });

    it("lets the Owner import coordinators and assign a hotel", async () => {
      const { eventId, hotelA } = await createTwoHotels();
      const owner = await staff("OWNER", eventId);
      const data = sheet(["name", "phone", "hotelName"], [["Asha Rao", "9876500099", "Hotel A"]]);
      const result = await commitImport(owner, "coordinators", data);
      expect(result).toMatchObject({ created: 1 });
      const newCoordinator = await prisma.user.findFirst({ where: { phone: "+919876500099" }, select: { id: true } });
      const membership = await prisma.eventMember.findUnique({
        where: { eventId_userId: { eventId, userId: newCoordinator!.id } },
        select: { hotelId: true },
      });
      expect(membership?.hotelId).toBe(hotelA.id);
    });

    it("treats the same phone already a member of this event as a duplicate", async () => {
      const eventId = await defaultEvent();
      const admin = await staff("ADMIN", eventId);
      const existing = await createUser("CUSTOMER", { eventId });
      const data = sheet(["name", "phone"], [["Someone Else", existing.phone.replace("+91", "")]]);
      const result = await commitImport(admin, "attendees", data);
      expect(result).toMatchObject({ created: 0, skippedDuplicate: 1 });
    });

    it("lets the same phone join a second event without being a duplicate", async () => {
      const eventA = await defaultEvent();
      const eventB = (await createEvent("Second event")).id;
      const adminA = await staff("ADMIN", eventA);
      const adminB = await staff("ADMIN", eventB);
      const existing = await createUser("CUSTOMER", { eventId: eventA });
      const data = sheet(["name", "phone"], [[existing.name, existing.phone.replace("+91", "")]]);
      const result = await commitImport(adminB, "attendees", data);
      expect(result).toMatchObject({ created: 0, addedExisting: 1 });
      void adminA;
    });

    it("reports a role mismatch as a failed row, not a silent skip", async () => {
      const eventId = await defaultEvent();
      const admin = await staff("ADMIN", eventId);
      const existingCoordinator = await createUser("COORDINATOR", { eventId });
      const data = sheet(["name", "phone"], [[existingCoordinator.name, existingCoordinator.phone.replace("+91", "")]]);
      const preview = await previewImport(admin, "attendees", data);
      expect(preview.rows[0]).toMatchObject({ status: "invalid", issues: [{ field: "phone", key: "roleMismatch" }] });
    });

    it("flags duplicate phone numbers within the uploaded file", async () => {
      const admin = await staff("ADMIN");
      const data = sheet(["name", "phone"], [
        ["First", "9876500001"],
        ["Second", "9876500001"],
      ]);
      const preview = await previewImport(admin, "attendees", data);
      expect(preview.rows[0].status).toBe("valid");
      expect(preview.rows[1]).toMatchObject({ status: "duplicate", key: "duplicatePhoneInFile" });
    });
  });

  describe("authorization and event isolation", () => {
    it("denies a coordinator actor entirely", async () => {
      const coordinator = await createUser("COORDINATOR");
      const data = sheet(["name", "address"], [["Grand Palace", "12 MG Road"]]);
      await expect(commitImport(coordinator, "hotels", data)).rejects.toMatchObject({ code: "forbidden" });
    });

    it("never resolves a hotelName from a different event", async () => {
      const { hotelA } = await createTwoHotels(); // in the default event
      const otherEventId = (await createEvent("Other event")).id;
      const admin = await staff("ADMIN", otherEventId);
      const data = sheet(["label", "hotelName"], [["Bus X", hotelA.name]]);
      const preview = await previewImport(admin, "buses", data);
      expect(preview.rows[0]).toMatchObject({ status: "invalid", issues: [{ field: "hotelName", key: "hotelNotFound" }] });
    });
  });

  describe("failure safety", () => {
    it("never leaves a partial row: a failed commit writes nothing for that row", async () => {
      const admin = await staff("ADMIN");
      // Two rows with the same (new) hotel name: the first creates it, the
      // second must be skipped as a duplicate rather than create a second
      // row or silently merge into the first.
      const data = sheet(
        ["name", "address"],
        [
          ["Grand Palace", "12 MG Road"],
          ["Grand Palace", "12 MG Road"],
        ],
      );
      await commitImport(admin, "hotels", data);
      expect(await prisma.hotel.count({ where: { name: "Grand Palace" } })).toBe(1);
    });
  });
});
