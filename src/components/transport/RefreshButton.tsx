"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";

/** Re-fetches the page's server data (until live updates arrive in Phase 5). */
export function RefreshButton({ label, busyLabel }: { label: string; busyLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="min-h-12 px-4 rounded-lg border-2 border-brand text-brand text-lg font-semibold disabled:opacity-60"
    >
      🔄 {pending ? busyLabel : label}
    </button>
  );
}
