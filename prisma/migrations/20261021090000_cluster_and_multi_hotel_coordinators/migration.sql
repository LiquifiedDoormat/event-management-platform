-- Aawas Yatra Phase 1: clusters, and many coordinators per hotel instead of one.
-- Hand-ordered so it is safe on databases that already contain data: new enum
-- value and tables/columns first, then backfill existing Hotel.coordinatorId
-- into EventMember.hotelId (every coordinator's EventMember row has a NULL
-- hotelId today, so this cannot conflict with anything), then drop the old
-- single-coordinator column. A bus's own designated coordinator (Bus.coordinatorId)
-- is unaffected — it was already a plain one-per-bus field.

-- 1. New role --------------------------------------------------------------
ALTER TYPE "Role" ADD VALUE 'CLUSTER_COORDINATOR';

-- 2. New table ---------------------------------------------------------------
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Cluster_eventId_name_idx" ON "Cluster"("eventId", "name");
ALTER TABLE "Cluster" ADD CONSTRAINT "Cluster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. New nullable columns ---------------------------------------------------
ALTER TABLE "Hotel" ADD COLUMN "clusterId" TEXT;
CREATE INDEX "Hotel_clusterId_idx" ON "Hotel"("clusterId");
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventMember" ADD COLUMN "clusterId" TEXT;
CREATE INDEX "EventMember_clusterId_idx" ON "EventMember"("clusterId");
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Backfill: a hotel's single designated coordinator becomes one of (now
-- possibly several) hotel coordinators, expressed the same way attendees'
-- hotels already are — via EventMember.hotelId. --------------------------
UPDATE "EventMember" em
SET "hotelId" = h."id"
FROM "Hotel" h
WHERE h."coordinatorId" = em."userId" AND h."eventId" = em."eventId";

-- 5. Drop the old single-coordinator column ---------------------------------
ALTER TABLE "Hotel" DROP CONSTRAINT "Hotel_coordinatorId_fkey";
DROP INDEX "Hotel_eventId_coordinatorId_key";
ALTER TABLE "Hotel" DROP COLUMN "coordinatorId";
