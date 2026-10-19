import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** GET search form: keeps state in the URL so results can be bookmarked/shared. */
export async function SearchForm({
  q,
  placeholder,
  children,
  activeFilters = 0,
}: {
  q?: string;
  placeholder: string;
  children?: ReactNode;
  /** Number of filters currently applied; filters start open if any are. */
  activeFilters?: number;
}) {
  const t = await getTranslations("directory");
  const filtersOpen = activeFilters > 0;
  return (
    <form method="get" role="search" className="flex flex-col gap-3 rounded-lg bg-gray-50 p-3">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t("search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="min-h-12 rounded-lg border-2 border-line bg-surface px-3 text-lg focus:border-brand outline-none"
        />
      </label>
      {children && (
        <details className="group" open={filtersOpen}>
          <summary className="min-h-11 cursor-pointer list-none font-semibold text-brand">
            <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span> {t("filters")}
            {activeFilters > 0 && ` (${activeFilters})`}
          </summary>
          <div className="mt-2 flex flex-wrap gap-3">{children}</div>
        </details>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="min-h-12 px-5 rounded-lg bg-brand text-brand-ink text-lg font-semibold">
          🔍 {t("searchButton")}
        </button>
        <Link href="?" className="min-h-12 px-4 inline-flex items-center rounded-lg border-2 border-line font-semibold">
          {t("clear")}
        </Link>
      </div>
    </form>
  );
}

/** Native select for GET filters. */
export function FilterSelect({
  name,
  label,
  value,
  options,
  allLabel,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-40 flex-1">
      <span className="font-semibold">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="min-h-12 rounded-lg border-2 border-line bg-surface px-3 text-lg"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Cursor pagination: "Next page" and "Back to first page" links preserving filters. */
export async function Pagination({
  nextCursor,
  params,
}: {
  nextCursor: string | null;
  params: Record<string, string | undefined>;
}) {
  const t = await getTranslations("directory");
  const base = Object.fromEntries(Object.entries(params).filter(([k, v]) => v && k !== "cursor")) as Record<string, string>;
  const href = (extra: Record<string, string>) => `?${new URLSearchParams({ ...base, ...extra })}`;
  if (!nextCursor && !params.cursor) return null;
  return (
    <nav aria-label={t("pages")} className="flex flex-wrap justify-between gap-3">
      {params.cursor ? (
        <Link href={href({})} className="min-h-12 px-4 inline-flex items-center rounded-lg border-2 border-line font-semibold">
          ⏮ {t("firstPage")}
        </Link>
      ) : (
        <span />
      )}
      {nextCursor && (
        <Link
          href={href({ cursor: nextCursor })}
          className="min-h-12 px-4 inline-flex items-center rounded-lg border-2 border-brand text-brand font-semibold"
        >
          {t("nextPage")} ▶
        </Link>
      )}
    </nav>
  );
}
