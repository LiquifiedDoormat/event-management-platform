"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { BusStatus } from "@/generated/prisma/enums";
import { STATUS_ICON, STATUS_KIND } from "@/lib/transport/status";
import { useGeolocationSharing } from "@/hooks/useGeolocationSharing";
import { changeStatusDirect, endTripDirect, setSharingDirect } from "@/features/trips/actions";

const STATUSES: BusStatus[] = ["BOARDING", "TO_HOTEL", "AT_HOTEL", "TO_STOP", "AT_STOP"];
/** Readings less precise than this are flagged (typical of laptops/Wi-Fi positioning). */
const POOR_ACCURACY_M = 100;
const noop = () => () => {};

type Props = {
  tripId: string;
  initialStatus: BusStatus;
  initialVersion: number;
  initialChangedAt: string;
};

/** Coordinator's trip screen: big status buttons, GPS sharing, end trip. */
export function TripControls({ tripId, initialStatus, initialVersion, initialChangedAt }: Props) {
  const t = useTranslations("trip");
  const ts = useTranslations("busStatus");
  const te = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 5_000 });
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [version, setVersion] = useState(initialVersion);
  const [changedAt, setChangedAt] = useState(new Date(initialChangedAt));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const goHome = () => router.replace("/coordinator");
  const { state: gps, start, stop } = useGeolocationSharing(tripId, goHome);
  // Geolocation only works on HTTPS (or localhost). Read on the client only.
  const secure = useSyncExternalStore(noop, () => window.isSecureContext, () => true);

  // Clear success messages after a few seconds so the screen stays calm.
  useEffect(() => {
    if (message?.tone !== "ok") return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  function choose(next: BusStatus) {
    if (pending || next === status) return;
    startTransition(async () => {
      const result = await changeStatusDirect(tripId, next, version);
      if (result.ok) {
        setStatus(next);
        setVersion(result.version ?? version);
        setChangedAt(new Date());
        setMessage({ tone: "ok", text: t("statusSaved", { status: ts(next) }) });
      } else {
        setMessage({ tone: "error", text: te(result.message) });
        // Someone else changed it: load the current status.
        if (result.message === "errors.reasons.staleStatus") router.refresh();
      }
    });
  }

  function toggleSharing() {
    if (gps.phase === "sharing" || gps.phase === "requesting") {
      stop();
      startTransition(async () => void (await setSharingDirect(tripId, false)));
    } else {
      start();
    }
  }

  function endTrip() {
    if (!window.confirm(t("confirmEnd"))) return;
    startTransition(async () => {
      stop();
      const result = await endTripDirect(tripId);
      if (result.ok) goHome();
      else setMessage({ tone: "error", text: te(result.message) });
    });
  }

  const sharingOn = gps.phase === "sharing" || gps.phase === "requesting";

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border-2 p-3 font-semibold ${message.tone === "error" ? "border-danger text-danger bg-red-50" : "border-ok text-ok bg-green-50"}`}
        >
          {message.tone === "ok" ? "✓ " : "⚠ "}
          {message.text}
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-xl font-semibold">
          {t("statusTitle")}
        </h2>
        <p className="text-muted">
          {t("currentSince", { time: format.dateTime(changedAt, { timeStyle: "short" }), ago: format.relativeTime(changedAt, now) })}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STATUSES.map((s) => {
            const current = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={() => choose(s)}
                disabled={pending}
                aria-pressed={current}
                className={`min-h-16 rounded-xl border-2 px-4 text-left text-xl font-bold disabled:opacity-70 ${
                  current ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink"
                }`}
              >
                <span aria-hidden="true">{STATUS_ICON[STATUS_KIND[s]]} </span>
                {ts(s)}
                {current && <span className="block text-base font-semibold">✓ {t("current")}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border-2 border-line p-4" aria-labelledby="gps-heading">
        <h2 id="gps-heading" className="text-xl font-semibold">
          {t("sharingTitle")}
        </h2>
        <p role="status" className={`text-lg font-semibold ${sharingOn ? "text-ok" : "text-muted"}`}>
          {gps.phase === "sharing" && `📡 ${t("sharingOn")}`}
          {gps.phase === "requesting" && `⏳ ${t("sharingStarting")}`}
          {gps.phase === "idle" && `⏸ ${t("sharingOff")}`}
          {gps.phase === "denied" && `⚠ ${t("denied")}`}
          {gps.phase === "unsupported" && `⚠ ${t("unsupported")}`}
          {gps.phase === "ended" && `⚠ ${te("errors.reasons.tripEnded")}`}
          {gps.phase === "signedOut" && `⚠ ${t("signedOut")}`}
        </p>
        {!secure && <p className="font-semibold text-danger">⚠ {t("insecure")}</p>}
        {sharingOn && gps.lastSentAt && (
          <p>
            {t("lastSent", { ago: format.relativeTime(new Date(gps.lastSentAt), now) })}
            {gps.accuracy !== null && ` · ${t("accuracy", { meters: gps.accuracy })}`}
          </p>
        )}
        {sharingOn && gps.gpsUnavailable && <p className="font-semibold text-warn">⚠ {t("gpsUnavailable")}</p>}
        {sharingOn && gps.accuracy !== null && gps.accuracy > POOR_ACCURACY_M && <p className="font-semibold text-warn">⚠ {t("poorAccuracy")}</p>}
        {sharingOn && gps.networkError && <p className="font-semibold text-warn">⚠ {t("networkRetry")}</p>}
        {gps.phase === "denied" && <p>{t("deniedHelp")}</p>}
        <button
          type="button"
          onClick={toggleSharing}
          className={`min-h-16 rounded-xl border-2 text-xl font-bold ${sharingOn ? "border-danger text-danger bg-surface" : "border-ok bg-ok text-white"}`}
        >
          {sharingOn ? `⏹ ${t("stopSharing")}` : `📡 ${t("startSharing")}`}
        </button>
        <p className="rounded-lg bg-amber-50 p-3 text-ink">
          ⚠ {t("keepOpen")} {gps.wakeLock && t("screenKeptOn")}
        </p>
      </section>

      <button
        type="button"
        onClick={endTrip}
        disabled={pending}
        className="min-h-14 self-start rounded-lg border-2 border-danger px-5 text-lg font-semibold text-danger disabled:opacity-60"
      >
        ⏹ {t("endTrip")}
      </button>
    </div>
  );
}
