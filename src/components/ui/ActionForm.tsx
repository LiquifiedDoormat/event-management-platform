"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { idle, type ActionState } from "@/features/admin/action-state";
import { Link } from "@/i18n/navigation";

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
  hidden,
  confirmMessage,
  tone = "primary",
  inline = false,
  resetOnSuccess = false,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  hidden?: Record<string, string>;
  confirmMessage?: string;
  tone?: keyof typeof tones;
  inline?: boolean;
  /** Clear the inputs after a successful save (for "add" forms). */
  resetOnSuccess?: boolean;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, idle);
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
      {state.secret && (
        <div role="status" className="w-full rounded-lg border-2 border-brand bg-blue-50 p-4">
          <p className="font-semibold">{t("pin.codeIntro")}</p>
          <p className="my-2 select-all font-mono text-3xl font-bold tracking-widest">{state.secret.code}</p>
          <p>{t("pin.codeHandover")}</p>
          {state.secret.href && (
            <Link href={state.secret.href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand underline">
              {t("pin.openPerson")} ▶
            </Link>
          )}
        </div>
      )}
    </form>
  );
}
