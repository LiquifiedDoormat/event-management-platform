// Expected, user-facing failures thrown by services. Anything else is a bug and
// is reported to the user as a generic error.
export type AppErrorCode = "forbidden" | "not_found" | "conflict" | "invalid";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    /** Stable reason key, translated in the UI under `errors.reasons.*`. */
    public readonly reason?: string,
  ) {
    super(reason ?? code);
    this.name = "AppError";
  }
}

export const forbidden = () => new AppError("forbidden");
export const notFound = () => new AppError("not_found");
export const conflict = (reason: string) => new AppError("conflict", reason);

/** Prisma unique-constraint violation (e.g. duplicate phone number). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
