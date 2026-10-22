-- A hotel coordinator is the responsible coordinator of at most one bus
-- (the brief: "Each has one assigned bus"). Bus.coordinatorId was never
-- unique, so nothing stopped assigning the same coordinator to several
-- buses. Replaces the plain index with a unique one; Postgres treats
-- multiple NULLs as distinct, so unassigned buses are unaffected.
DROP INDEX "Bus_coordinatorId_idx";
CREATE UNIQUE INDEX "Bus_coordinatorId_key" ON "Bus"("coordinatorId");
