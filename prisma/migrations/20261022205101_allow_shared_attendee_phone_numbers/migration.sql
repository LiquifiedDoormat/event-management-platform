-- DropIndex
DROP INDEX "User_phone_key";

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");
