"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** Re-fetches this server-rendered page on an interval, only while visible. */
export function AutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs, router]);
  return null;
}
