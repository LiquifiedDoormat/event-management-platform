/** File-download links to an API route, not a page — next/link doesn't apply here. */
export function ExportAttendeesLink({ label, xlsxLabel }: { label: string; xlsxLabel: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation */}
      <a href="/api/export/attendees" className="self-start text-brand font-semibold underline">
        ⬇ {label}
      </a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation */}
      <a href="/api/export/attendees?format=xlsx" className="self-start text-brand font-semibold underline">
        ⬇ {xlsxLabel}
      </a>
    </div>
  );
}
