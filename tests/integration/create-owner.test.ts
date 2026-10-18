import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createUser, hasTestDb, resetDb } from "./helpers";

function run(...args: string[]) {
  try {
    const out = execFileSync("npx", ["tsx", "scripts/create-owner.ts", ...args], {
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status: number; stderr: string };
    return { code: e.status, out: e.stderr };
  }
}

describe.skipIf(!hasTestDb)("owner bootstrap script", () => {
  beforeEach(resetDb);

  it("creates the first owner and refuses a second without --allow-additional", async () => {
    expect(run("--phone", "98765 11111", "--name", "First Owner").code).toBe(0);
    const owner = await prisma.user.findUniqueOrThrow({ where: { phone: "+919876511111" } });
    expect(owner.role).toBe("OWNER");
    expect(await prisma.auditLog.count({ where: { action: "owner.bootstrap", entityId: owner.id } })).toBe(1);

    const second = run("--phone", "98765 22222", "--name", "Second");
    expect(second.code).toBe(1);
    expect(second.out).toMatch(/already exists/);
    expect(run("--phone", "98765 22222", "--name", "Second", "--allow-additional").code).toBe(0);
  }, 60_000);

  it("only promotes an existing account when explicitly asked", async () => {
    const admin = await createUser("ADMIN");
    expect(run("--phone", admin.phone, "--name", "Promoted").code).toBe(1);
    expect(run("--phone", admin.phone, "--name", "Promoted", "--promote-existing").code).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("OWNER");
  }, 60_000);

  it("rejects invalid input", () => {
    expect(run("--phone", "123", "--name", "X").code).toBe(1);
    expect(run("--phone", "98765 33333").code).toBe(1);
  }, 60_000);
});
