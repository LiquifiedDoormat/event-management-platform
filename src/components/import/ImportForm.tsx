"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { commitImportAction, previewImportAction } from "@/features/import/actions";
import { importIdle, type ImportActionState } from "@/features/import/action-state";
import { IMPORT_COLUMNS, type ImportEntity } from "@/lib/import/entities";

const FIELD_ERROR_KEYS = new Set(["required", "tooLong", "invalidNumber", "outOfRange", "invalidPhone", "coordsPair", "invalid", "tooShort"]);

export function ImportForm({ allowedEntities }: { allowedEntities: ImportEntity[] }) {
  const t = useTranslations("import");
  const tf = useTranslations("forms.fieldErrors");
  const [entity, setEntity] = useState<ImportEntity>(allowedEntities[0]);
  const [state, setState] = useState<ImportActionState>(importIdle);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const issueLabel = (issue: { field: string; key: string }) => {
    const message = FIELD_ERROR_KEYS.has(issue.key) ? tf(issue.key) : t(`issueKeys.${issue.key}`);
    return `${t(`fields.${issue.field}`)}: ${message}`;
  };

  function submit(mode: "preview" | "commit") {
    const form = formRef.current;
    if (!form) return;
    if (mode === "commit" && !window.confirm(t("confirmImport"))) return;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await (mode === "preview" ? previewImportAction : commitImportAction)(importIdle, data);
      setState(result);
    });
  }

  const columns = IMPORT_COLUMNS[entity];
  const canCommit = state.status === "preview" && state.preview.rows.some((r) => r.status === "valid");

  return (
    <div className="flex flex-col gap-5">
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="import-entity" className="font-semibold">
            {t("entity")}
          </label>
          <select
            id="import-entity"
            name="entity"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value as ImportEntity);
              setState(importIdle);
            }}
            className="w-full min-h-12 rounded-lg border-2 border-line bg-surface px-3 text-lg"
          >
            {allowedEntities.map((e) => (
              <option key={e} value={e}>
                {t(`entities.${e}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-line p-3 text-base flex flex-col gap-1">
          <p className="font-semibold">{t("columnsHeading")}</p>
          <p>
            {t("required")}: {columns.required.map((c) => t(`fields.${c}`)).join(", ")}
          </p>
          {columns.optional.length > 0 && (
            <p>
              {t("optional")}: {columns.optional.map((c) => t(`fields.${c}`)).join(", ")}
            </p>
          )}
          <a
            className="text-brand font-semibold underline underline-offset-4 self-start"
            href={`/api/import/template?entity=${entity}`}
          >
            {t("downloadTemplate")}
          </a>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="import-file" className="font-semibold">
            {t("file")}
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,.xlsx"
            required
            onChange={() => setState(importIdle)}
            className="w-full min-h-12 rounded-lg border-2 border-line bg-surface px-3 py-2 text-lg"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("preview")}
            className="min-h-12 px-5 rounded-lg border-2 bg-surface text-ink border-line text-lg font-semibold disabled:opacity-60"
          >
            {pending ? t("checking") : t("preview")}
          </button>
          {canCommit && (
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("commit")}
              className="min-h-12 px-5 rounded-lg border-2 bg-brand text-brand-ink border-brand text-lg font-semibold disabled:opacity-60"
            >
              {pending ? t("importing") : t("confirm")}
            </button>
          )}
        </div>
      </form>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg p-3 font-semibold border-2 border-danger text-danger bg-red-50">
          ⚠ {t(state.message)}
          {state.details && state.details.length > 0 ? `: ${state.details.join(", ")}` : ""}
        </p>
      )}

      {state.status === "preview" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t("previewHeading")}</h2>
          <p>
            {t("results.totalRows")}: {state.preview.totalDataRows}
          </p>
          <RowGroup
            label={t("valid", { count: state.preview.rows.filter((r) => r.status === "valid").length })}
            rows={state.preview.rows.filter((r) => r.status === "valid")}
            render={(r) => (r.status === "valid" ? Object.values(r.display).join(" · ") : "")}
            rowLabel={(r) => t("rowLabel", { row: r.row })}
          />
          <RowGroup
            label={t("duplicate", { count: state.preview.rows.filter((r) => r.status === "duplicate").length })}
            rows={state.preview.rows.filter((r) => r.status === "duplicate")}
            render={(r) => (r.status === "duplicate" ? t(`issueKeys.${r.key}`) : "")}
            rowLabel={(r) => t("rowLabel", { row: r.row })}
          />
          <RowGroup
            label={t("invalid", { count: state.preview.rows.filter((r) => r.status === "invalid").length })}
            rows={state.preview.rows.filter((r) => r.status === "invalid")}
            render={(r) => (r.status === "invalid" ? r.issues.map(issueLabel).join("; ") : "")}
            rowLabel={(r) => t("rowLabel", { row: r.row })}
          />
          {!canCommit && <p className="text-muted">{t("noValidRows")}</p>}
        </section>
      )}

      {state.status === "done" && (
        <section className="flex flex-col gap-2 rounded-lg border-2 border-ok bg-green-50 p-4">
          <h2 className="text-xl font-semibold text-ok">{t("doneHeading")}</h2>
          <p>
            {t("results.created")}: {state.result.created}
          </p>
          <p>
            {t("results.addedExisting")}: {state.result.addedExisting}
          </p>
          <p>
            {t("results.skippedDuplicate")}: {state.result.skippedDuplicate}
          </p>
          <p>
            {t("results.invalidRows")}: {state.result.invalidRows}
          </p>
          {state.result.failed.length > 0 && (
            <div>
              <p className="font-semibold">{t("results.failedRows")}:</p>
              <ul className="list-disc pl-5">
                {state.result.failed.map((f) => (
                  <li key={f.row}>
                    {t("rowLabel", { row: f.row })}: {t(f.message)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function RowGroup<T extends { row: number }>({
  label,
  rows,
  render,
  rowLabel,
}: {
  label: string;
  rows: T[];
  render: (row: T) => string;
  rowLabel: (row: T) => string;
}) {
  const t = useTranslations("import");
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 100);
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <ul className="list-disc pl-5 text-base">
        {shown.map((r) => (
          <li key={r.row}>
            {rowLabel(r)}: {render(r)}
          </li>
        ))}
      </ul>
      {rows.length > shown.length && <p className="text-muted">{t("moreRows", { count: rows.length - shown.length })}</p>}
    </div>
  );
}
