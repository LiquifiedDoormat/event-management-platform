"use client";

import { useCallback, useEffect, useState } from "react";
import type { BusLiveSnapshot } from "@/lib/realtime/types";

// Live state of one bus for viewers, by polling the server (no paid realtime
// service). Polls only while the page is visible: every 20 s while the bus is
// on a trip, every 60 s otherwise, and immediately when the page becomes visible.

const POLL_ACTIVE_MS = 20_000;
const POLL_IDLE_MS = 60_000;

/** Keeps the newest location if an older one arrives late (same trip). */
function merge(current: BusLiveSnapshot, incoming: BusLiveSnapshot): BusLiveSnapshot {
  const a = current.location?.recordedAt;
  const b = incoming.location?.recordedAt;
  if (incoming.trip && current.trip && a && b && b < a) return { ...incoming, location: current.location };
  return incoming;
}

export type LiveMode = "polling" | "offline";

export function useBusLive(busId: string, initial: BusLiveSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [mode, setMode] = useState<LiveMode>("polling");

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/buses/${busId}/live`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(String(res.status));
      const next = ((await res.json()) as { data: BusLiveSnapshot }).data;
      setSnapshot((cur) => merge(cur, next));
      setMode("polling");
    } catch {
      // Keep the last known state; freshness labels show how old it is.
      setMode("offline");
    }
  }, [busId]);

  const active = Boolean(snapshot.trip);
  useEffect(() => {
    const id = setInterval(poll, active ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, poll]);

  return { snapshot, mode };
}
