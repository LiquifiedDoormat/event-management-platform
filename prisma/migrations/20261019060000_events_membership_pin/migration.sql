-- Phase 8: first-class events, per-event membership, PIN sign-in.
-- Hand-ordered so it is safe on databases that already contain data:
-- new tables first, then backfill existing hotels and attendee allotments into
-- a default event, then tighten constraints and drop the old columns.
-- On an empty database (e.g. first production deploy) no event is created.

-- 1. New tables -------------------------------------------------------------
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE,
    "endsOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "attendeeCodeHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Event_dates_valid" CHECK ("endsOn" IS NULL OR "startsOn" IS NULL OR "endsOn" >= "startsOn")
);
CREATE INDEX "Event_isActive_name_idx" ON "Event"("isActive", "name");

CREATE TABLE "EventMember" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventMember_eventId_userId_key" ON "EventMember"("eventId", "userId");
CREATE INDEX "EventMember_userId_idx" ON "EventMember"("userId");
CREATE INDEX "EventMember_hotelId_idx" ON "EventMember"("hotelId");

-- 2. New nullable columns ---------------------------------------------------
ALTER TABLE "Hotel" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Session" ADD COLUMN "eventId" TEXT;
ALTER TABLE "User"
  ADD COLUMN "pinHash" TEXT,
  ADD COLUMN "pinSetupCodeHash" TEXT,
  ADD COLUMN "pinSetupExpiresAt" TIMESTAMP(3),
  ADD COLUMN "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_failedPinAttempts_nonneg" CHECK ("failedPinAttempts" >= 0);

-- 3. Backfill existing data into a default event (only if there is data) ---
INSERT INTO "Event" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT 'evt_default', COALESCE((SELECT "eventName" FROM "EventConfig" WHERE "id" = 1), 'Event'), true, now(), now()
WHERE EXISTS (SELECT 1 FROM "Hotel")
   OR EXISTS (SELECT 1 FROM "User" WHERE "role" IN ('CUSTOMER', 'COORDINATOR'));

UPDATE "Hotel" SET "eventId" = 'evt_default' WHERE "eventId" IS NULL;

INSERT INTO "EventMember" ("id", "eventId", "userId", "hotelId", "createdAt")
SELECT 'mem_' || "id", 'evt_default', "id", "hotelId", now()
FROM "User"
WHERE "role" IN ('CUSTOMER', 'COORDINATOR')
  AND EXISTS (SELECT 1 FROM "Event" WHERE "id" = 'evt_default');

-- 4. Tighten constraints, swap indexes, drop old columns --------------------
ALTER TABLE "Hotel" ALTER COLUMN "eventId" SET NOT NULL;
DROP INDEX "Hotel_coordinatorId_key";
DROP INDEX "Hotel_isActive_name_idx";
CREATE INDEX "Hotel_eventId_isActive_name_idx" ON "Hotel"("eventId", "isActive", "name");
CREATE UNIQUE INDEX "Hotel_eventId_coordinatorId_key" ON "Hotel"("eventId", "coordinatorId");

ALTER TABLE "User" DROP CONSTRAINT "User_hotelId_fkey";
DROP INDEX "User_hotelId_idx";
ALTER TABLE "User" DROP COLUMN "hotelId";
CREATE UNIQUE INDEX "User_pinSetupCodeHash_key" ON "User"("pinSetupCodeHash");

ALTER TABLE "EventConfig" DROP COLUMN "eventName";

-- 5. Foreign keys -----------------------------------------------------------
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
