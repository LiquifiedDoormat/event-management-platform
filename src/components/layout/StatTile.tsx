import { Link } from "@/i18n/navigation";

export function StatTile({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <p className="text-3xl font-bold tabular-nums">{value.toLocaleString("en-IN")}</p>
      <p className={href ? "text-brand font-semibold underline underline-offset-4" : "text-muted"}>{label}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line p-4 hover:border-brand">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-line p-4">{body}</div>
  );
}
