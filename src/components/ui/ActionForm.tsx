"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { idle, type ActionState } from "@/features/admin/action-state";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const FieldErrors = createContext<Record<string, string>>({});
export const useFieldError = (name: string) => useContext(FieldErrors)[name];

const tones = {
  primary: "bg-brand text-brand-ink border-brand",
  secondary: "bg-surface text-ink border-line",
  danger: "bg-surface text-danger border-danger",
} as const;

/**
 * Form bound to a Server Action. Shows a translated status message, passes field
 * errors to <TextField>/<SelectField>, disables the button while pending (no
 * double submits) and optionally asks for confirmation (destructive actions).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  ariaLabel,
  hidden,
  confirmMessage,
  tone = "primary",
  inline = false,
  resetOnSuccess = false,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  /**
   * Overrides the button's accessible name when `submitLabel` alone is
   * ambiguous out of visual context — e.g. a "Remove" or "Board" button
   * repeated once per row in a list. Include the row's own name/label.
   */
  ariaLabel?: string;
  hidden?: Record<string, string>;
  confirmMessage?: string;
  tone?: keyof typeof tones;
  inline?: boolean;
  /** Clear the inputs after a successful save (for "add" forms). */
  resetOnSuccess?: boolean;
}) {
  const t = useTranslations();
  // Wraps the action so a failed network call (e.g. the device loses signal
  // mid-tap) resolves to a normal error state instead of throwing — an
  // uncaught rejection here would otherwise blow away the whole page via the
  // route's error boundary, losing every other row's state along with it.
  // Scoped to the form, not just attendance, but written for that case: a
  // coordinator mid-boarding-list shouldn't lose the list over one bad tap.
  const safeAction = async (prevState: ActionState, form: FormData): Promise<ActionState> => {
    try {
      return await action(prevState, form);
    } catch {
      return { status: "error", message: "errors.network" };
    }
  };
  const [state, formAction, pending] = useActionState(safeAction, idle);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === "ok") formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      // Submitting via onSubmit (not the `action` prop) stops React from resetting
      // the inputs, so users keep what they typed when validation fails.
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={inline ? "flex flex-wrap items-end gap-3" : "flex flex-col gap-4"}
      noValidate
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <FieldErrors.Provider value={state.fieldErrors ?? {}}>{children}</FieldErrors.Provider>
      <button
        type="submit"
        disabled={pending}
        aria-label={ariaLabel}
        className={`min-h-12 px-5 rounded-lg border-2 text-lg font-semibold disabled:opacity-60 ${tones[tone]} ${inline ? "" : "self-start"}`}
      >
        {pending ? t("forms.saving") : submitLabel}
      </button>
      {state.message && state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`w-full rounded-lg p-3 font-semibold ${
            state.status === "error" ? "border-2 border-danger text-danger bg-red-50" : "border-2 border-ok text-ok bg-green-50"
          }`}
        >
          {state.status === "ok" ? "✓ " : "⚠ "}
          {t(state.message)}
        </p>
      )}
    </form>
  );
}
