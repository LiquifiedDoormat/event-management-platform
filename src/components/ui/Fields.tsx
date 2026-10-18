"use client";

import { useId, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { useFieldError } from "./ActionForm";

const inputClass =
  "w-full min-h-12 rounded-lg border-2 border-line bg-surface px-3 text-lg focus:border-brand outline-none aria-[invalid=true]:border-danger";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("forms.fieldErrors");
  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-base">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger font-semibold">
          {t(error)}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = { name: string; label: string; hint?: string; multiline?: boolean } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "id"
>;

export function TextField({ name, label, hint, multiline, ...rest }: TextFieldProps) {
  const id = useId();
  const error = useFieldError(name);
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          defaultValue={rest.defaultValue as string | undefined}
          rows={3}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${inputClass} py-2`}
        />
      ) : (
        <input id={id} name={name} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={inputClass} {...rest} />
      )}
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  hint,
  emptyLabel,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
  /** Adds a first option with value "" (e.g. "None"). */
  emptyLabel?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={Boolean(error)} className={inputClass}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
