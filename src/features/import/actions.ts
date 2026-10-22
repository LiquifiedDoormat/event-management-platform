"use server";

// Bulk import: preview (validate only) and commit (validate again, then
// write). Both re-parse the uploaded file from scratch on every call, so
// nothing trusted is ever carried in client state between the two steps.

import { getCurrentUser } from "@/lib/auth/current-user";
import { IMPORT_ENTITIES, type ImportEntity } from "@/lib/import/entities";
import { ImportError } from "@/lib/import/errors";
import { parseSpreadsheet } from "@/lib/import/parse";
import { AppError } from "@/server/errors";
import * as importService from "@/server/services/import";
import type { ImportActionState } from "./action-state";

function parseEntity(v: FormDataEntryValue | null): ImportEntity {
  if (typeof v === "string" && (IMPORT_ENTITIES as string[]).includes(v)) return v as ImportEntity;
  throw new ImportError("invalidEntity");
}

async function run(form: FormData, mode: "preview" | "commit"): Promise<ImportActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "errors.unauthenticated" };
  try {
    const entity = parseEntity(form.get("entity"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ImportError("noFile");
    const sheet = await parseSpreadsheet(file);
    if (mode === "preview") return { status: "preview", preview: await importService.previewImport(user, entity, sheet) };
    return { status: "done", result: await importService.commitImport(user, entity, sheet) };
  } catch (err) {
    if (err instanceof ImportError) return { status: "error", message: `import.errors.${err.code}`, details: err.details };
    if (err instanceof AppError) return { status: "error", message: err.reason ? `errors.reasons.${err.reason}` : `errors.${err.code}` };
    console.error("[import] failed", (err as Error).name); // no message: may contain personal data
    return { status: "error", message: "errors.generic" };
  }
}

export async function previewImportAction(_: ImportActionState, form: FormData) {
  return run(form, "preview");
}

export async function commitImportAction(_: ImportActionState, form: FormData) {
  return run(form, "commit");
}
