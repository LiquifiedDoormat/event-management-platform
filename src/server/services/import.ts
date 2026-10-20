import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { busInput, hotelInput } from "@/lib/validation/entities";
import { phone, requiredText } from "@/lib/validation/common";
import { assignableRoles, can, type Actor } from "@/server/policies";
import { AppError, forbidden } from "@/server/errors";
import { IMPORT_COLUMNS, type ImportEntity } from "@/lib/import/entities";
import { ImportError } from "@/lib/import/errors";
import type { ParsedSheet } from "@/lib/import/parse";
import { eventOf } from "./context";
import { assignHotelCoordinator, createHotel } from "./hotels";
import { assignBusCoordinator, createBus } from "./buses";
import { createPerson } from "./people";

// Bulk import: every row is validated the same way whether it's only being
// previewed or actually committed. Nothing is written until `commitImport`
// calls a row's `commit()` — and even then each row goes through the same
// service functions (and the same policy checks) as the manual admin forms,
// one at a time, so a failure on one row never rolls back another.

export type FieldIssue = { field: string; key: string };

type InternalRow =
  | { row: number; status: "valid"; display: Record<string, string>; commit: () => Promise<{ kind: "created" | "addedExisting" }> }
  | { row: number; status: "duplicate"; key: string; display: Record<string, string> }
  | { row: number; status: "invalid"; issues: FieldIssue[] };

export type ImportPreviewRow =
  | { row: number; status: "valid"; display: Record<string, string> }
  | { row: number; status: "duplicate"; key: string; display: Record<string, string> }
  | { row: number; status: "invalid"; issues: FieldIssue[] };

export type ImportPreview = { entity: ImportEntity; totalDataRows: number; rows: ImportPreviewRow[] };

export type ImportCommitResult = {
  entity: ImportEntity;
  totalDataRows: number;
  created: number;
  addedExisting: number;
  skippedDuplicate: number;
  invalidRows: number;
  failed: { row: number; message: string }[];
};

const KNOWN_FIELD_KEYS = new Set([
  "required",
  "tooLong",
  "invalidNumber",
  "outOfRange",
  "invalidPhone",
  "coordsPair",
  "invalid",
  "tooShort",
]);

function zodIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: String(issue.path[0] ?? "_form"),
    key: KNOWN_FIELD_KEYS.has(issue.message) ? issue.message : "invalid",
  }));
}

/** Which roles may import which entity — the same rules as the manual forms. */
function requireImportPermission(actor: Actor, entity: ImportEntity) {
  if (entity === "hotels" && !can(actor, "hotel.create")) throw forbidden();
  if (entity === "buses" && !can(actor, "bus.create")) throw forbidden();
  if (entity === "coordinators" && !assignableRoles(actor).includes("COORDINATOR")) throw forbidden();
  if (entity === "attendees" && !assignableRoles(actor).includes("CUSTOMER")) throw forbidden();
}

const normalizeHeader = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

function headerIndex(headers: string[], name: string): number {
  const target = normalizeHeader(name);
  return headers.findIndex((h) => normalizeHeader(h) === target);
}

function checkColumns(headers: string[], entity: ImportEntity) {
  const missing = IMPORT_COLUMNS[entity].required.filter((c) => headerIndex(headers, c) < 0);
  if (missing.length) throw new ImportError("missingColumns", missing);
}

function rowObject(headers: string[], row: string[], columns: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const col of columns) {
    const idx = headerIndex(headers, col);
    obj[col] = idx >= 0 ? row[idx] ?? "" : "";
  }
  return obj;
}

/** Active hotels matching any of `names` (case-insensitive), keyed by lower-cased name. */
async function resolveHotelMap(eventId: string, names: string[]) {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, { id: string; isActive: boolean }>();
  if (!wanted.length) return map;
  const hotels = await prisma.hotel.findMany({
    where: { eventId, OR: wanted.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) },
    select: { id: true, name: true, isActive: true },
  });
  for (const h of hotels) map.set(h.name.trim().toLowerCase(), { id: h.id, isActive: h.isActive });
  return map;
}

/** Active coordinators registered for this event, among `phones` (already-normalized E.164 values), keyed by phone. */
async function resolveCoordinatorMap(eventId: string, phones: string[]) {
  const wanted = [...new Set(phones)];
  const map = new Map<string, string>();
  if (!wanted.length) return map;
  const coordinators = await prisma.user.findMany({
    where: { phone: { in: wanted }, role: "COORDINATOR", status: "ACTIVE", memberships: { some: { eventId } } },
    select: { id: true, phone: true },
  });
  for (const c of coordinators) map.set(c.phone, c.id);
  return map;
}

// ---------------------------------------------------------------------------
// Per-entity analysis
// ---------------------------------------------------------------------------

async function analyzeHotels(actor: Actor, eventId: string, sheet: ParsedSheet): Promise<InternalRow[]> {
  checkColumns(sheet.headers, "hotels");
  const existing = await prisma.hotel.findMany({ where: { eventId }, select: { name: true } });
  const seen = new Set(existing.map((h) => h.name.trim().toLowerCase()));
  const columns = [...IMPORT_COLUMNS.hotels.required, ...IMPORT_COLUMNS.hotels.optional];

  return sheet.rows.map((row, i): InternalRow => {
    const rowNum = i + 2;
    const obj = rowObject(sheet.headers, row, columns);
    const parsed = hotelInput.safeParse(obj);
    if (!parsed.success) return { row: rowNum, status: "invalid", issues: zodIssues(parsed.error) };
    const key = parsed.data.name.trim().toLowerCase();
    if (seen.has(key)) return { row: rowNum, status: "duplicate", key: "duplicateHotelName", display: { name: parsed.data.name } };
    seen.add(key);
    return {
      row: rowNum,
      status: "valid",
      display: { name: parsed.data.name, address: parsed.data.address },
      commit: async () => {
        await createHotel(actor, parsed.data);
        return { kind: "created" };
      },
    };
  });
}

async function analyzeBuses(actor: Actor, eventId: string, sheet: ParsedSheet): Promise<InternalRow[]> {
  checkColumns(sheet.headers, "buses");
  const columns = [...IMPORT_COLUMNS.buses.required, ...IMPORT_COLUMNS.buses.optional];
  const objs = sheet.rows.map((row) => rowObject(sheet.headers, row, columns));
  const hotelMap = await resolveHotelMap(eventId, objs.map((o) => o.hotelName));

  // coordinatorPhone is optional and needs "assign coordinator" permission (Owner only,
  // same as the manual bus-edit page) — only parse/resolve it if the actor even has that.
  const canAssignCoordinator = can(actor, "bus.assignCoordinator");
  const candidatePhones = canAssignCoordinator
    ? objs.map((o) => phone.safeParse(o.coordinatorPhone)).filter((p) => p.success).map((p) => p.data)
    : [];
  const coordinatorMap = await resolveCoordinatorMap(eventId, candidatePhones);

  const existingBuses = await prisma.bus.findMany({
    where: { hotel: { eventId } },
    select: { label: true, hotelId: true, registration: true },
  });
  const seenNoReg = new Set(existingBuses.filter((b) => !b.registration).map((b) => `${b.hotelId}::${b.label.trim().toLowerCase()}`));
  const seenReg = new Set(existingBuses.filter((b) => b.registration).map((b) => b.registration as string));

  return objs.map((obj, i): InternalRow => {
    const rowNum = i + 2;
    const parsed = busInput.safeParse(obj);
    if (!parsed.success) return { row: rowNum, status: "invalid", issues: zodIssues(parsed.error) };
    const hotelName = obj.hotelName.trim();
    if (!hotelName) return { row: rowNum, status: "invalid", issues: [{ field: "hotelName", key: "required" }] };
    const hotel = hotelMap.get(hotelName.toLowerCase());
    if (!hotel) return { row: rowNum, status: "invalid", issues: [{ field: "hotelName", key: "hotelNotFound" }] };
    if (!hotel.isActive) return { row: rowNum, status: "invalid", issues: [{ field: "hotelName", key: "hotelInactive" }] };

    const coordinatorPhoneRaw = (obj.coordinatorPhone ?? "").trim();
    let coordinatorId: string | null = null;
    if (coordinatorPhoneRaw) {
      if (!canAssignCoordinator) {
        return { row: rowNum, status: "invalid", issues: [{ field: "coordinatorPhone", key: "coordinatorAssignForbidden" }] };
      }
      const normalized = phone.safeParse(coordinatorPhoneRaw);
      if (!normalized.success) return { row: rowNum, status: "invalid", issues: [{ field: "coordinatorPhone", key: "invalidPhone" }] };
      const id = coordinatorMap.get(normalized.data);
      if (!id) return { row: rowNum, status: "invalid", issues: [{ field: "coordinatorPhone", key: "coordinatorNotFound" }] };
      coordinatorId = id;
    }

    const reg = parsed.data.registration;
    const noRegKey = `${hotel.id}::${parsed.data.label.trim().toLowerCase()}`;
    if (reg ? seenReg.has(reg) : seenNoReg.has(noRegKey)) {
      return { row: rowNum, status: "duplicate", key: reg ? "duplicateRegistration" : "duplicateBus", display: { label: parsed.data.label } };
    }
    if (reg) seenReg.add(reg);
    else seenNoReg.add(noRegKey);

    return {
      row: rowNum,
      status: "valid",
      display: { label: parsed.data.label, hotel: hotelName, ...(coordinatorId ? { coordinator: coordinatorPhoneRaw } : {}) },
      commit: async () => {
        const bus = await createBus(actor, { ...parsed.data, hotelId: hotel.id });
        if (coordinatorId) await assignBusCoordinator(actor, bus.id, coordinatorId);
        return { kind: "created" };
      },
    };
  });
}

const importPersonRow = z.object({ name: requiredText(120), phone });

async function analyzePeople(actor: Actor, eventId: string, sheet: ParsedSheet, role: "COORDINATOR" | "CUSTOMER"): Promise<InternalRow[]> {
  const entity: ImportEntity = role === "COORDINATOR" ? "coordinators" : "attendees";
  checkColumns(sheet.headers, entity);
  const columns = [...IMPORT_COLUMNS[entity].required, ...IMPORT_COLUMNS[entity].optional];
  const objs = sheet.rows.map((row) => rowObject(sheet.headers, row, columns));

  const parsedRows = objs.map((obj) => importPersonRow.safeParse({ name: obj.name, phone: obj.phone }));
  const candidatePhones = parsedRows.filter((p) => p.success).map((p) => (p.success ? p.data.phone : "")).filter(Boolean);
  const hotelMap = await resolveHotelMap(eventId, objs.map((o) => o.hotelName ?? ""));

  const existing = candidatePhones.length
    ? await prisma.user.findMany({
        where: { phone: { in: candidatePhones } },
        select: { id: true, phone: true, role: true, memberships: { where: { eventId }, select: { id: true } } },
      })
    : [];
  const existingByPhone = new Map(existing.map((u) => [u.phone, u]));
  const seenPhones = new Set<string>();

  return objs.map((obj, i): InternalRow => {
    const rowNum = i + 2;
    const parsed = parsedRows[i];
    if (!parsed.success) return { row: rowNum, status: "invalid", issues: zodIssues(parsed.error) };
    const { name, phone: normPhone } = parsed.data;

    let hotelId: string | null = null;
    const hotelName = (obj.hotelName ?? "").trim();
    if (hotelName) {
      const hotel = hotelMap.get(hotelName.toLowerCase());
      if (!hotel) return { row: rowNum, status: "invalid", issues: [{ field: "hotelName", key: "hotelNotFound" }] };
      if (!hotel.isActive) return { row: rowNum, status: "invalid", issues: [{ field: "hotelName", key: "hotelInactive" }] };
      hotelId = hotel.id;
    }

    if (seenPhones.has(normPhone)) {
      return { row: rowNum, status: "duplicate", key: "duplicatePhoneInFile", display: { name, phone: normPhone } };
    }
    const existingUser = existingByPhone.get(normPhone);
    if (existingUser) {
      if (existingUser.role !== role) return { row: rowNum, status: "invalid", issues: [{ field: "phone", key: "roleMismatch" }] };
      if (existingUser.memberships.length > 0) {
        return { row: rowNum, status: "duplicate", key: "duplicatePhone", display: { name, phone: normPhone } };
      }
    }
    seenPhones.add(normPhone);

    return {
      row: rowNum,
      status: "valid",
      display: { name, phone: normPhone, ...(hotelName ? { hotel: hotelName } : {}) },
      commit: async () => {
        const created = await createPerson(actor, {
          name,
          phone: normPhone,
          role,
          hotelId: role === "CUSTOMER" && hotelId ? hotelId : undefined,
        });
        if (role === "COORDINATOR" && hotelId) await assignHotelCoordinator(actor, hotelId, created.id);
        return created.addedExisting ? { kind: "addedExisting" } : { kind: "created" };
      },
    };
  });
}

function analyze(actor: Actor, entity: ImportEntity, eventId: string, sheet: ParsedSheet): Promise<InternalRow[]> {
  if (entity === "hotels") return analyzeHotels(actor, eventId, sheet);
  if (entity === "buses") return analyzeBuses(actor, eventId, sheet);
  if (entity === "coordinators") return analyzePeople(actor, eventId, sheet, "COORDINATOR");
  return analyzePeople(actor, eventId, sheet, "CUSTOMER");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Validates (never writes). Reports every row's outcome, bounded by the sheet's own row cap. */
export async function previewImport(actor: Actor, entity: ImportEntity, sheet: ParsedSheet): Promise<ImportPreview> {
  requireImportPermission(actor, entity);
  const eventId = eventOf(actor);
  const rows = await analyze(actor, entity, eventId, sheet);
  return {
    entity,
    totalDataRows: sheet.rows.length,
    rows: rows.map((r): ImportPreviewRow =>
      r.status === "valid"
        ? { row: r.row, status: "valid", display: r.display }
        : r.status === "duplicate"
          ? { row: r.row, status: "duplicate", key: r.key, display: r.display }
          : { row: r.row, status: "invalid", issues: r.issues },
    ),
  };
}

/**
 * Re-validates from scratch, then writes only the valid rows — one row at a
 * time, each through the normal create service (so each row is its own
 * transaction and a failure on one row never undoes another). Never a
 * partial, unreported import: every row ends up counted in exactly one bucket.
 */
export async function commitImport(actor: Actor, entity: ImportEntity, sheet: ParsedSheet): Promise<ImportCommitResult> {
  requireImportPermission(actor, entity);
  const eventId = eventOf(actor);
  const rows = await analyze(actor, entity, eventId, sheet);

  let created = 0;
  let addedExisting = 0;
  let skippedDuplicate = rows.filter((r) => r.status === "duplicate").length;
  const failed: { row: number; message: string }[] = [];

  for (const r of rows) {
    if (r.status !== "valid") continue;
    try {
      const outcome = await r.commit();
      if (outcome.kind === "created") created++;
      else addedExisting++;
    } catch (err) {
      if (err instanceof AppError && err.code === "conflict") {
        skippedDuplicate++;
        continue;
      }
      failed.push({
        row: r.row,
        message: err instanceof AppError ? (err.reason ? `errors.reasons.${err.reason}` : `errors.${err.code}`) : "errors.generic",
      });
    }
  }

  return {
    entity,
    totalDataRows: sheet.rows.length,
    created,
    addedExisting,
    skippedDuplicate,
    invalidRows: rows.filter((r) => r.status === "invalid").length,
    failed,
  };
}
