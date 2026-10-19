/** Result of a form Server Action. Messages are translation keys. */
export type ActionState = {
  status: "idle" | "ok" | "error";
  /** Key under `errors.*` or `forms.*` (e.g. "errors.reasons.duplicatePhone"). */
  message?: string;
  /** field name → key under `forms.fieldErrors.*` */
  fieldErrors?: Record<string, string>;
};

export const idle: ActionState = { status: "idle" };
