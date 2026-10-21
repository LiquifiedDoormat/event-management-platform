-- Aawas Yatra Phase 3: a real bidirectional bus lifecycle (boarding at the
-- venue or at the hotel, in either direction) with an explicit transition
-- table enforced in services/trips.ts, plus delayed/cancelled as flags
-- (either can apply on any leg, so they're not status values) and an explicit
-- "from" status on every history event.
--
-- Hand-ordered so it is safe on databases that already contain data: creates
-- the new enum type, migrates every existing Trip/BusStatusEvent row onto it
-- with an explicit mapping (old single-direction model -> new bidirectional
-- one), then drops the old type. No data is discarded; every old value maps
-- to exactly one new value.

-- 1. New enum type ------------------------------------------------------
CREATE TYPE "BusStatus_new" AS ENUM ('BOARDING_AT_VENUE', 'DEPARTED_VENUE', 'ARRIVED_AT_HOTEL', 'BOARDING_AT_HOTEL', 'DEPARTED_HOTEL', 'ARRIVED_AT_VENUE');

-- 2. Trip.status: migrate via a new column, old data mapped as
--    BOARDING->BOARDING_AT_VENUE, TO_HOTEL->DEPARTED_VENUE, AT_HOTEL->ARRIVED_AT_HOTEL,
--    TO_STOP->DEPARTED_HOTEL, AT_STOP->ARRIVED_AT_VENUE (the old model's single
--    "next stop" direction after the hotel is the new hotel->venue leg). -----
ALTER TABLE "Trip" ADD COLUMN "status_new" "BusStatus_new";
UPDATE "Trip" SET "status_new" = (CASE "status"::text
  WHEN 'BOARDING' THEN 'BOARDING_AT_VENUE'
  WHEN 'TO_HOTEL' THEN 'DEPARTED_VENUE'
  WHEN 'AT_HOTEL' THEN 'ARRIVED_AT_HOTEL'
  WHEN 'TO_STOP' THEN 'DEPARTED_HOTEL'
  WHEN 'AT_STOP' THEN 'ARRIVED_AT_VENUE'
END)::"BusStatus_new";
ALTER TABLE "Trip" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "status_new" SET DEFAULT 'BOARDING_AT_VENUE';
ALTER TABLE "Trip" DROP COLUMN "status";
ALTER TABLE "Trip" RENAME COLUMN "status_new" TO "status";

ALTER TABLE "Trip" ADD COLUMN "isDelayed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Trip" ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT false;

-- 3. BusStatusEvent.status: same mapping; also add the new fromStatus column,
--    backfilled from each event's previous event in the same trip (NULL for
--    a trip's first event, matching new rows going forward). ----------------
ALTER TABLE "BusStatusEvent" ADD COLUMN "status_new" "BusStatus_new";
UPDATE "BusStatusEvent" SET "status_new" = (CASE "status"::text
  WHEN 'BOARDING' THEN 'BOARDING_AT_VENUE'
  WHEN 'TO_HOTEL' THEN 'DEPARTED_VENUE'
  WHEN 'AT_HOTEL' THEN 'ARRIVED_AT_HOTEL'
  WHEN 'TO_STOP' THEN 'DEPARTED_HOTEL'
  WHEN 'AT_STOP' THEN 'ARRIVED_AT_VENUE'
END)::"BusStatus_new";
ALTER TABLE "BusStatusEvent" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "BusStatusEvent" DROP COLUMN "status";
ALTER TABLE "BusStatusEvent" RENAME COLUMN "status_new" TO "status";

ALTER TABLE "BusStatusEvent" ADD COLUMN "fromStatus" "BusStatus_new";
UPDATE "BusStatusEvent" e
SET "fromStatus" = (
  SELECT p."status" FROM "BusStatusEvent" p
  WHERE p."tripId" = e."tripId" AND p."createdAt" < e."createdAt"
  ORDER BY p."createdAt" DESC LIMIT 1
);

-- 4. Swap the enum type in. ---------------------------------------------
DROP TYPE "BusStatus";
ALTER TYPE "BusStatus_new" RENAME TO "BusStatus";
