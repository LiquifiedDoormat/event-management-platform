// Creates the first Owner account. The ONLY way to create an Owner: the app UI
// can never grant the OWNER role. Requires direct database access (DATABASE_URL),
// which is the trust boundary for this operation.
//
// Usage:
//   npm run owner:create -- --phone "+91 98765 43210" --name "Full Name"
// Options:
//   --allow-additional   create another Owner even if one already exists
//   --promote-existing   promote an existing account with this phone to Owner
//   --reset-pin          issue a new setup code for an existing Owner (forgotten PIN)
//
// Prints a one-time setup code; the Owner uses it on the sign-in page
// ("Staff or coordinator" → "First time") to choose their 6-digit PIN.
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { maskPhone, normalizePhone } from "../src/lib/utils/phone";
import { hashSetupCode, newSetupCode, SETUP_CODE_DAYS } from "../src/lib/auth/pin";

const { values } = parseArgs({
  options: {
    phone: { type: "string" },
    name: { type: "string" },
    "allow-additional": { type: "boolean", default: false },
    "promote-existing": { type: "boolean", default: false },
    "reset-pin": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(`create-owner: ${message}`);
  process.exit(1);
}

const phone = normalizePhone(values.phone ?? "");
const name = values.name?.trim();
if (!phone) fail("--phone must be a valid mobile number");
if (!name && !values["reset-pin"]) fail("--name is required");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const setupCode = newSetupCode();
const setupData = {
  pinHash: null,
  pinSetupCodeHash: hashSetupCode(setupCode),
  pinSetupExpiresAt: new Date(Date.now() + SETUP_CODE_DAYS * 86_400_000),
  failedPinAttempts: 0,
  pinLockedUntil: null,
};

function printCode(who: string) {
  console.log(`${who} (${maskPhone(phone!)}). One-time setup code (shown once, expires in ${SETUP_CODE_DAYS} days):\n\n    ${setupCode}\n\nSign in → "Staff or coordinator" → "First time" → enter the phone number, this code and a new 6-digit PIN.`);
}

async function resetOwnerPin() {
  await prisma.$transaction(async (tx) => {
    const owner = await tx.user.findFirst({ where: { phone: phone!, role: "OWNER" }, select: { id: true } });
    if (!owner) fail(`no Owner account with ${maskPhone(phone!)}`);
    await tx.user.update({ where: { id: owner!.id }, data: setupData });
    await tx.session.updateMany({ where: { userId: owner!.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: null, action: "owner.resetPin", entityType: "User", entityId: owner!.id, metadata: { via: "scripts/create-owner.ts" } } });
  });
  printCode("Owner PIN reset");
}

async function main() {
  if (values["reset-pin"]) return resetOwnerPin();
  await prisma.$transaction(async (tx) => {
    const owners = await tx.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners > 0 && !values["allow-additional"]) {
      fail(`an active Owner already exists (${owners}). Re-run with --allow-additional to add another.`);
    }

    const existing = await tx.user.findUnique({ where: { phone: phone! }, select: { id: true, role: true } });
    let userId: string;
    if (existing) {
      if (!values["promote-existing"]) {
        fail(`an account with ${maskPhone(phone!)} already exists (role ${existing.role}). Use --promote-existing.`);
      }
      await tx.user.update({ where: { id: existing.id }, data: { role: "OWNER", status: "ACTIVE", name: name!, ...setupData } });
      // Force a fresh sign-in so the new role is picked up cleanly.
      await tx.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      userId = existing.id;
    } else {
      userId = (await tx.user.create({ data: { phone: phone!, name: name!, role: "OWNER", ...setupData }, select: { id: true } })).id;
    }

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: existing ? "owner.promote" : "owner.bootstrap",
        entityType: "User",
        entityId: userId,
        metadata: { via: "scripts/create-owner.ts" },
      },
    });
    printCode(`Owner ready: ${name}`);
  });
}

main()
  .catch((err) => {
    console.error("create-owner failed:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
