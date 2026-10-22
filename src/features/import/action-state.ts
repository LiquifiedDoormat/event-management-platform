import type { ImportCommitResult, ImportPreview } from "@/server/services/import";

/** Result of a bulk-import Server Action. Not in actions.ts: a "use server" file may only export async functions. */
export type ImportActionState =
  | { status: "idle" }
  | { status: "error"; message: string; details?: string[] }
  | { status: "preview"; preview: ImportPreview }
  | { status: "done"; result: ImportCommitResult };

export const importIdle: ImportActionState = { status: "idle" };
