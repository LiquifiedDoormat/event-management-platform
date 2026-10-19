import { Link } from "@/i18n/navigation";

/** "◀ Back"-style link with a full-size tap target. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="self-start min-h-11 inline-flex items-center pr-3 text-brand font-semibold">
      <span aria-hidden="true">◀&nbsp;</span>
      {label}
    </Link>
  );
}
