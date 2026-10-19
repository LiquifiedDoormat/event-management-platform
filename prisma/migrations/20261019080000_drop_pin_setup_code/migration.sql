-- One-time setup codes were replaced before release: an account without a PIN
-- chooses one at its next sign-in (owner decision). Columns held only hashes.
-- DropIndex
DROP INDEX "User_pinSetupCodeHash_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "pinSetupCodeHash",
DROP COLUMN "pinSetupExpiresAt";

