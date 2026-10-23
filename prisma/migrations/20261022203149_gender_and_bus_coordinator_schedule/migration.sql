-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gender" TEXT;

-- CreateTable
CREATE TABLE "BusCoordinatorAssignment" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusCoordinatorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusCoordinatorAssignment_busId_startsOn_idx" ON "BusCoordinatorAssignment"("busId", "startsOn");

-- CreateIndex
CREATE INDEX "BusCoordinatorAssignment_coordinatorId_startsOn_idx" ON "BusCoordinatorAssignment"("coordinatorId", "startsOn");

-- AddForeignKey
ALTER TABLE "BusCoordinatorAssignment" ADD CONSTRAINT "BusCoordinatorAssignment_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusCoordinatorAssignment" ADD CONSTRAINT "BusCoordinatorAssignment_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusCoordinatorAssignment" ADD CONSTRAINT "BusCoordinatorAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
