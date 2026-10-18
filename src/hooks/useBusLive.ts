"use client";

import { useCallback, useEffect, useState } from "react";
import type Pusher from "pusher-js";
import { BUS_EVENT, busChannel, pusherPublic, type BusLiveSnapshot } from "@/lib/realtime/types";

// Live state of one bus for viewers. Uses Pusher when configured; otherwise (or
// while disconnected) polls the server. Polling also runs slowly alongside
// Pusher as a safety net, and only while the page is visible.

const POLL_FALLBACK_MS = 15_000;
const POLL_SAFETY_MS = 60_000;

let pusherClient: Promise<Pusher> | null = null;
function getPusher(): Promise<Pusher> {
  pusherClient ??= import("pusher-js").then(
    ({ default: PusherCtor }) =>
      new PusherCtor(pusherPublic.key!, {
        cluster: pusherPublic.cluster!,
        channelAuthorization: { endpoint: "/api/realtime/auth", transport: "ajax" },
      }),
  );
  return pusherClient;
}

/** Keeps the newest location if an older one arrives late (same trip). */
function merge(current: BusLiveSnapshot, incoming: BusLiveSnapshot): BusLiveSnapshot {
  const a = current.location?.recordedAt;
  const b = incoming.location?.recordedAt;
  if (incoming.trip && current.trip && a && b && b < a) return { ...incoming, location: current.location };
  return incoming;
}

export type LiveMode = "live" | "polling";

export function useBusLive(busId: string, initial: BusLiveSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [mode, setMode] = useState<LiveMode>("polling");
  const apply = useCallback((s: BusLiveSnapshot) => setSnapshot((cur) => merge(cur, s)), []);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/buses/${busId}/live`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (res.ok) apply(((await res.json()) as { data: BusLiveSnapshot }).data);
    } catch {
      // Network hiccup: keep the last known state; it is labelled stale by time.
    }
  }, [busId, apply]);

  // Realtime subscription (only if Pusher is configured).
  useEffect(() => {
    if (!pusherPublic.key || !pusherPublic.cluster) return;
    let disposed = false;
    let cleanup = () => {};
    void getPusher().then((client) => {
      if (disposed) return;
      const channel = client.subscribe(busChannel(busId));
      const onState = ({ current }: { current: string }) => setMode(current === "connected" ? "live" : "polling");
      channel.bind(BUS_EVENT, apply);
      channel.bind("pusher:subscription_error", () => setMode("polling"));
      channel.bind("pusher:subscription_succeeded", () => {
        setMode("live");
        void poll(); // catch anything missed before subscribing
      });
      client.connection.bind("state_change", onState);
      cleanup = () => {
        channel.unbind(BUS_EVENT, apply);
        client.connection.unbind("state_change", onState);
        client.unsubscribe(busChannel(busId));
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [busId, apply, poll]);

  // Polling: frequent when not live, occasional as a safety net when live.
  useEffect(() => {
    const id = setInterval(poll, mode === "live" ? POLL_SAFETY_MS : POLL_FALLBACK_MS);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode, poll]);

  return { snapshot, mode };
}
