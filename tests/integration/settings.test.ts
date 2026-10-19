import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/server/errors";
import { getSettings, listAuditLog, settingsInput, updateSettings } from "@/server/services/settings";
import * as hotels from "@/server/services/hotels";
import { hotelInput } from "@/lib/validation/entities";
import { createUser, hasTestDb, resetDb } from "./helpers";

async function forbidden(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe("forbidden");
}

describe("settings validation", () => {
  it("enforces the same bounds as the database", () => {
    const ok = { eventName: "Expo", staleLocationSeconds: "120", locationRetentionDays: "7", historySampleSeconds: "30" };
    expect(settingsInput.parse(ok)).toEqual({ eventName: "Expo", staleLocationSeconds: 120, locationRetentionDays: 7, historySampleSeconds: 30 });
    expect(settingsInput.safeParse({ ...ok, staleLocationSeconds: "10" }).success).toBe(false);
    expect(settingsInput.safeParse({ ...ok, locationRetentionDays: "400" }).success).toBe(false);
    expect(settingsInput.safeParse({ ...ok, historySampleSeconds: "2.5" }).success).toBe(false);
    expect(settingsInput.safeParse({ ...ok, eventName: " " }).success).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("owner settings and audit log", () => {
  beforeEach(resetDb);

  it("lets the owner read and change settings, recording only changed fields", async () => {
    const owner = await createUser("OWNER");
    expect((await getSettings(owner)).staleLocationSeconds).toBe(120); // defaults before the row exists
    await updateSettings(owner, { eventName: "Expo 2026", staleLocationSeconds: 90, locationRetentionDays: 7, historySampleSeconds: 30 });
    expect(await getSettings(owner)).toMatchObject({ eventName: "Expo 2026", staleLocationSeconds: 90 });
    await updateSettings(owner, { eventName: "Expo 2026", staleLocationSeconds: 60, locationRetentionDays: 7, historySampleSeconds: 30 });
    const last = await prisma.auditLog.findFirstOrThrow({ where: { action: "config.update" }, orderBy: { createdAt: "desc" } });
    expect(last.metadata).toEqual({ staleLocationSeconds: 60 });
  });

  it("keeps settings and the audit log away from everyone but the owner", async () => {
    const admin = await createUser("ADMIN");
    const coordinator = await createUser("COORDINATOR");
    const input = { eventName: "X", staleLocationSeconds: 120, locationRetentionDays: 7, historySampleSeconds: 30 };
    for (const user of [admin, coordinator]) {
      await forbidden(getSettings(user));
      await forbidden(updateSettings(user, input));
      await forbidden(listAuditLog(user, {}));
    }
  });

  it("lists the audit log newest first, with paging and an entity filter", async () => {
    const owner = await createUser("OWNER");
    for (let i = 0; i < 27; i++) await hotels.createHotel(owner, hotelInput.parse({ name: `H${i}`, address: "A" }));
    await updateSettings(owner, { eventName: "E", staleLocationSeconds: 120, locationRetentionDays: 7, historySampleSeconds: 30 });

    const first = await listAuditLog(owner, {});
    expect(first.items).toHaveLength(25);
    expect(first.items[0].action).toBe("config.update");
    expect(first.items[0].actor?.id).toBe(owner.id);
    const second = await listAuditLog(owner, { cursor: first.nextCursor! });
    expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map((e) => e.id)).size).toBe(28);

    // Sign-ins are hidden unless requested.
    await prisma.auditLog.create({ data: { actorId: owner.id, action: "auth.login", entityType: "User", entityId: owner.id } });
    expect((await listAuditLog(owner, {})).items[0].action).toBe("config.update");
    expect((await listAuditLog(owner, { includeSignIns: true })).items[0].action).toBe("auth.login");

    const onlyConfig = await listAuditLog(owner, { entityType: "EventConfig" });
    expect(onlyConfig.items.map((e) => e.action)).toEqual(["config.update"]);
  });
});
