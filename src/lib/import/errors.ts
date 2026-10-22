/** Fatal, file-level import failures (never a bug — always shown to the admin). */
export class ImportError extends Error {
  constructor(
    public readonly code: string,
    /** Extra detail, e.g. the names of missing columns. */
    public readonly details?: string[],
  ) {
    super(code);
    this.name = "ImportError";
  }
}
