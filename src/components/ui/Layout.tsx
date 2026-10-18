import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

// Small server-rendered building blocks shared by directory and detail pages.

export function PageHeader({ title, action }: { title: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold">{title}</h1>
      {action && (
        <Link
          href={action.href}
          className="min-h-12 px-4 inline-flex items-center rounded-lg bg-brand text-brand-ink text-lg font-semibold"
        >
          ＋ {action.label}
        </Link>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line p-4 flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const badgeTones = {
  neutral: "border-line text-ink",
  ok: "border-ok text-ok",
  warn: "border-warn text-warn",
  danger: "border-danger text-danger",
} as const;

/** Text label with a coloured border; colour is never the only signal. */
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-md border-2 px-2 py-0.5 text-base font-semibold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function ListCard({ href, title, children }: { href: string; title: string; children?: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-lg border border-line p-4 hover:border-brand focus-visible:border-brand"
      >
        <span className="text-lg font-semibold text-brand underline-offset-4 hover:underline">{title}</span>
        <div className="mt-1 flex flex-col gap-1 text-base">{children}</div>
      </Link>
    </li>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border-2 border-dashed border-line p-6 text-center text-lg">{children}</p>;
}

export function DetailList({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="mb-2 sm:mb-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Open in Google Maps" link from coordinates (no API key needed). */
export function MapsLink({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand font-semibold underline underline-offset-4"
    >
      📍 {label}
    </a>
  );
}
