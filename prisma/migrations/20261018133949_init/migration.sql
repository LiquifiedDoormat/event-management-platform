-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'COORDINATOR', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'hi');

-- CreateEnum
CREATE TYPE "BusStatus" AS ENUM ('BOARDING', 'TO_HOTEL', 'AT_HOTEL', 'TO_STOP', 'AT_STOP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "preferredLocale" "Locale" NOT NULL DEFAULT 'en',
    "hotelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "coordinatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "registration" TEXT,
    "hotelId" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "routeNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusStop" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "status" "BusStatus" NOT NULL DEFAULT 'BOARDING',
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusVersion" INTEGER NOT NULL DEFAULT 0,
    "sharingLocation" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusLocation" (
    "busId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusLocation_pkey" PRIMARY KEY ("busId")
);

-- CreateTable
CREATE TABLE "LocationPoint" (
    "id" BIGSERIAL NOT NULL,
    "tripId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusStatusEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "status" "BusStatus" NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "eventName" TEXT NOT NULL DEFAULT 'Event',
    "staleLocationSeconds" INTEGER NOT NULL DEFAULT 120,
    "locationRetentionDays" INTEGER NOT NULL DEFAULT 7,
    "historySampleSeconds" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_hotelId_idx" ON "User"("hotelId");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_coordinatorId_key" ON "Hotel"("coordinatorId");

-- CreateIndex
CREATE INDEX "Hotel_isActive_name_idx" ON "Hotel"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_registration_key" ON "Bus"("registration");

-- CreateIndex
CREATE INDEX "Bus_hotelId_isActive_idx" ON "Bus"("hotelId", "isActive");

-- CreateIndex
CREATE INDEX "Bus_coordinatorId_idx" ON "Bus"("coordinatorId");

-- CreateIndex
CREATE UNIQUE INDEX "BusStop_busId_sequence_key" ON "BusStop"("busId", "sequence");

-- CreateIndex
CREATE INDEX "Trip_busId_endedAt_idx" ON "Trip"("busId", "endedAt");

-- CreateIndex
CREATE INDEX "Trip_coordinatorId_endedAt_idx" ON "Trip"("coordinatorId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusLocation_tripId_key" ON "BusLocation"("tripId");

-- CreateIndex
CREATE INDEX "LocationPoint_tripId_recordedAt_idx" ON "LocationPoint"("tripId", "recordedAt");

-- CreateIndex
CREATE INDEX "LocationPoint_recordedAt_idx" ON "LocationPoint"("recordedAt");

-- CreateIndex
CREATE INDEX "BusStatusEvent_tripId_createdAt_idx" ON "BusStatusEvent"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "BusStatusEvent_busId_createdAt_idx" ON "BusStatusEvent"("busId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusStop" ADD CONSTRAINT "BusStop_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusLocation" ADD CONSTRAINT "BusLocation_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusLocation" ADD CONSTRAINT "BusLocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPoint" ADD CONSTRAINT "LocationPoint_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusStatusEvent" ADD CONSTRAINT "BusStatusEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusStatusEvent" ADD CONSTRAINT "BusStatusEvent_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusStatusEvent" ADD CONSTRAINT "BusStatusEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma cannot express in schema.prisma (hand-written).
-- ---------------------------------------------------------------------------

-- At most one active (not ended) trip per bus.
CREATE UNIQUE INDEX "Trip_one_active_per_bus" ON "Trip"("busId") WHERE "endedAt" IS NULL;

-- Valid coordinate ranges; both-or-neither for optional coordinates.
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_coords_valid" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "BusStop" ADD CONSTRAINT "BusStop_coords_valid" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "BusLocation" ADD CONSTRAINT "BusLocation_coords_valid" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND ("accuracy" IS NULL OR "accuracy" >= 0)
);
ALTER TABLE "LocationPoint" ADD CONSTRAINT "LocationPoint_coords_valid" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND ("accuracy" IS NULL OR "accuracy" >= 0)
);

ALTER TABLE "BusStop" ADD CONSTRAINT "BusStop_sequence_positive" CHECK ("sequence" > 0);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_end_after_start" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

-- Event settings: single row, sane bounds.
ALTER TABLE "EventConfig" ADD CONSTRAINT "EventConfig_singleton" CHECK ("id" = 1);
ALTER TABLE "EventConfig" ADD CONSTRAINT "EventConfig_bounds" CHECK (
  "staleLocationSeconds" BETWEEN 15 AND 3600 AND
  "locationRetentionDays" BETWEEN 0 AND 365 AND
  "historySampleSeconds" BETWEEN 5 AND 3600
);

-- Phone numbers must be E.164.
ALTER TABLE "User" ADD CONSTRAINT "User_phone_e164" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');
