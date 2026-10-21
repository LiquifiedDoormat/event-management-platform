/** File-download link to an API route, not a page — next/link doesn't apply here. */
export function ExportAttendeesLink({ label }: { label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation
    <a href="/api/export/attendees" className="self-start text-brand font-semibold underline">
      ⬇ {label}
    </a>
  );
}
