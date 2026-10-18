"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Coordinator-side GPS sharing using the browser Geolocation API.
//
// Battery/network: readings are sent at most every MIN_INTERVAL_MS, or sooner
// (after MOVE_INTERVAL_MS) if the bus moved more than MOVE_METERS. When the
// phone is stationary, browsers may stop firing watchPosition, so a heartbeat
// asks for a fresh position every HEARTBEAT_MS.
//
// Limits: browsers pause JavaScript when the screen locks or the page is in the
// background. Sharing only works reliably while this page stays open and on
// screen; we request a Screen Wake Lock where supported to help with that.

const MIN_INTERVAL_MS = 10_000;
const MOVE_INTERVAL_MS = 5_000;
const MOVE_METERS = 25;
const HEARTBEAT_MS = 30_000;
const SEND_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const RESUME_KEY = "gps-sharing-trip";

export type SharingPhase = "idle" | "requesting" | "sharing" | "denied" | "unsupported" | "ended";
export type SharingState = {
  phase: SharingPhase;
  /** Last reading accepted by the server. */
  lastSentAt: number | null;
  accuracy: number | null;
  /** GPS temporarily unavailable (no fix yet, tunnel, indoors). */
  gpsUnavailable: boolean;
  /** Last send failed; will retry automatically. */
  networkError: boolean;
  wakeLock: boolean;
};

type Pos = { latitude: number; longitude: number; accuracy: number | null; recordedAt: number };

function metersBetween(a: Pos, b: Pos) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useGeolocationSharing(tripId: string, onStopped?: () => void) {
  const [state, setState] = useState<SharingState>({
    phase: "idle",
    lastSentAt: null,
    accuracy: null,
    gpsUnavailable: false,
    networkError: false,
    wakeLock: false,
  });
  const watchId = useRef<number | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const latest = useRef<Pos | null>(null);
  const lastSent = useRef<{ pos: Pos; at: number } | null>(null);
  const inFlight = useRef(false);
  const backoff = useRef(2_000);
  const active = useRef(false);
  // Lets the retry timer call the latest `send` without a self-reference.
  const sendRef = useRef<(pos: Pos) => Promise<void>>(async () => {});
  // The caller's callback may change every render; read it through a ref so the
  // watcher is never torn down and restarted because of a re-render.
  const onStoppedRef = useRef(onStopped);
  useEffect(() => {
    onStoppedRef.current = onStopped;
  }, [onStopped]);
  const update = (patch: Partial<SharingState>) => setState((s) => ({ ...s, ...patch }));

  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLock.current = await navigator.wakeLock.request("screen");
        update({ wakeLock: true });
        wakeLock.current.addEventListener("release", () => update({ wakeLock: false }));
      }
    } catch {
      update({ wakeLock: false });
    }
  }, []);

  const teardown = useCallback(() => {
    active.current = false;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (heartbeat.current) clearInterval(heartbeat.current);
    if (retry.current) clearTimeout(retry.current);
    watchId.current = heartbeat.current = retry.current = null;
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  const send = useCallback(
    async (pos: Pos) => {
      inFlight.current = true;
      try {
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, ...pos }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (res.status === 409 || res.status === 403 || res.status === 404) {
          // Trip ended or no longer ours: stop for good.
          teardown();
          sessionStorage.removeItem(RESUME_KEY);
          update({ phase: "ended", networkError: false });
          onStoppedRef.current?.();
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        lastSent.current = { pos, at: Date.now() };
        backoff.current = 2_000;
        update({ lastSentAt: Date.now(), accuracy: pos.accuracy, networkError: false });
      } catch {
        update({ networkError: true });
        // Retry the newest reading with bounded exponential backoff.
        if (active.current && !retry.current) {
          retry.current = setTimeout(() => {
            retry.current = null;
            if (latest.current && active.current && !inFlight.current) void sendRef.current(latest.current);
          }, backoff.current);
          backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF_MS);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [tripId, teardown],
  );
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const onPosition = useCallback(
    (p: GeolocationPosition) => {
      const pos: Pos = {
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        recordedAt: Math.round(p.timestamp),
      };
      latest.current = pos;
      update({ phase: "sharing", gpsUnavailable: false });
      if (inFlight.current || retry.current) return;
      const prev = lastSent.current;
      const since = prev ? Date.now() - prev.at : Infinity;
      const moved = prev ? metersBetween(prev.pos, pos) : Infinity;
      if (since >= MIN_INTERVAL_MS || (since >= MOVE_INTERVAL_MS && moved >= MOVE_METERS)) void send(pos);
    },
    [send],
  );

  const onError = useCallback(
    (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        teardown();
        sessionStorage.removeItem(RESUME_KEY);
        update({ phase: "denied" });
      } else {
        update({ gpsUnavailable: true });
      }
    },
    [teardown],
  );

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) return update({ phase: "unsupported" });
    if (active.current) return;
    active.current = true;
    sessionStorage.setItem(RESUME_KEY, tripId);
    update({ phase: "requesting", networkError: false });
    const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 };
    watchId.current = navigator.geolocation.watchPosition(onPosition, onError, opts);
    heartbeat.current = setInterval(() => navigator.geolocation.getCurrentPosition(onPosition, () => {}, opts), HEARTBEAT_MS);
    void acquireWakeLock();
  }, [tripId, onPosition, onError, acquireWakeLock]);

  const stop = useCallback(() => {
    teardown();
    sessionStorage.removeItem(RESUME_KEY);
    update({ phase: "idle", networkError: false, gpsUnavailable: false });
  }, [teardown]);

  // Resume after a reload if sharing was on for this trip (permission is remembered).
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    const resume = sessionStorage.getItem(RESUME_KEY) === tripId ? setTimeout(() => startRef.current(), 0) : null;
    return () => {
      if (resume) clearTimeout(resume);
      teardown(); // only on unmount or a different trip
    };
  }, [tripId, teardown]);

  // Wake locks are released when the page is hidden; take it again on return,
  // and send a fresh reading straight away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && active.current) {
        void acquireWakeLock();
        navigator.geolocation.getCurrentPosition(onPosition, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 });
      }
    };
    const onOnline = () => {
      if (active.current && latest.current && !inFlight.current) void send(latest.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [acquireWakeLock, onPosition, send]);

  return { state, start, stop };
}
