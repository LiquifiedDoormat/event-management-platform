"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import type { BusStatus } from "@/generated/prisma/enums";
import { STATUS_ICON, STATUS_KIND, locationFreshness, type Freshness } from "@/lib/transport/status";
import type { MapPoint } from "@/lib/maps/config";
import type { BusLiveSnapshot } from "@/lib/realtime/types";
import { useBusLive, type LiveMode } from "@/hooks/useBusLive";
import { LocationMap } from "@/components/maps/LocationMap";

const KIND_STYLE = {
  boarding: "border-warn bg-amber-50 text-warn",
  moving: "border-brand bg-orange-50 text-brand",
  arrived: "border-ok bg-green-50 text-ok",
} as const;

function StatusPanel({
  status,
  since,
  now,
  large,
  delayed,
}: {
  status: BusStatus | null;
  since: Date | null;
  now: Date;
  large: boolean;
  delayed?: boolean;
}) {
  const t = useTranslations("transport");
  const tt = useTranslations("trip");
  const ts = useTranslations("busStatus");
  const format = useFormatter();
  const text = large ? "text-2xl" : "text-lg";
  if (!status) return <p className={`rounded-lg border-2 border-line p-3 font-semibold ${text}`}>⏸ {t("notRunning")}</p>;
  const kind = STATUS_KIND[status];
  return (
    <div className={`rounded-lg border-2 p-3 ${KIND_STYLE[kind]}`}>
      <p className={`font-bold ${text}`}>
        <span aria-hidden="true">{STATUS_ICON[kind]} </span>
        {ts(status)}
      </p>
      {delayed && <p className="font-bold text-warn">⚠ {tt("delayed")}</p>}
      {since && (
        <p className="text-ink">{t("statusSince", { time: format.dateTime(since, { timeStyle: "short" }), ago: format.relativeTime(since, now) })}</p>
      )}
    </div>
  );
}

function FreshnessNote({ freshness, recordedAt, now }: { freshness: Freshness; recordedAt: Date | null; now: Date }) {
  const t = useTranslations("transport");
  const format = useFormatter();
  if (freshness === "none" || !recordedAt) return <p className="text-muted">📡 {t("locationNone")}</p>;
  const ago = format.relativeTime(recordedAt, now);
  return freshness === "live" ? (
    <p className="font-semibold text-ok">📡 {t("locationLive", { ago })}</p>
  ) : (
    <p className="font-semibold text-warn">⚠ {t("locationStale", { ago })}</p>
  );
}

function ModeNote({ mode }: { mode: LiveMode }) {
  const t = useTranslations("transport");
  return mode === "offline" ? (
    <p role="status" className="font-semibold text-warn">⚠ {t("offline")}</p>
  ) : (
    <p className="text-muted text-base">🔄 {t("polling")}</p>
  );
}

/** Compact live status for the attendee homepage (no map). */
export function LiveBusSummary({ busId, initial, staleSeconds }: { busId: string; initial: BusLiveSnapshot; staleSeconds: number }) {
  const { snapshot } = useBusLive(busId, initial);
  const now = useNow({ updateInterval: 15_000 });
  const recordedAt = snapshot.location ? new Date(snapshot.location.recordedAt) : null;
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <StatusPanel
        status={snapshot.trip?.status ?? null}
        since={snapshot.trip ? new Date(snapshot.trip.statusChangedAt) : null}
        now={now}
        large={false}
        delayed={snapshot.trip?.isDelayed}
      />
      {snapshot.trip && <FreshnessNote freshness={locationFreshness(recordedAt, staleSeconds, now.getTime())} recordedAt={recordedAt} now={now} />}
    </div>
  );
}

/** Full live view for the tracking page: status, freshness, map. */
export function LiveBusDetail({
  busId,
  initial,
  staleSeconds,
  staticPoints,
  mapLabel,
  mapTexts,
}: {
  busId: string;
  initial: BusLiveSnapshot;
  staleSeconds: number;
  /** Hotel and stops. The bus marker is added from live data. */
  staticPoints: MapPoint[];
  mapLabel: string;
  mapTexts: { loading: string; failed: string; unavailable: string };
}) {
  const t = useTranslations("transport");
  const { snapshot, mode } = useBusLive(busId, initial);
  const now = useNow({ updateInterval: 15_000 });
  const loc = snapshot.location;
  const recordedAt = loc ? new Date(loc.recordedAt) : null;
  const freshness = locationFreshness(recordedAt, staleSeconds, now.getTime());

  const points = [...staticPoints];
  if (loc && freshness !== "none") {
    points.push({
      id: "bus",
      lat: loc.latitude,
      lng: loc.longitude,
      kind: freshness === "live" ? "bus" : "busStale",
      glyph: "🚌",
      title: freshness === "live" ? t("busHere") : t("busLastSeen"),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div aria-live="polite">
        <StatusPanel
          status={snapshot.trip?.status ?? null}
          since={snapshot.trip ? new Date(snapshot.trip.statusChangedAt) : null}
          now={now}
          large
          delayed={snapshot.trip?.isDelayed}
        />
      </div>
      <section className="rounded-lg border border-line p-4 flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("location")}</h2>
        <div aria-live="polite">
          <FreshnessNote freshness={freshness} recordedAt={recordedAt} now={now} />
        </div>
        {snapshot.trip && !snapshot.trip.sharingLocation && <p className="text-muted">{t("sharingOff")}</p>}
        <LocationMap
          points={points}
          label={mapLabel}
          loadingText={mapTexts.loading}
          failedText={mapTexts.failed}
          fallback={<p className="text-muted">{mapTexts.unavailable}</p>}
        />
        {loc && freshness !== "none" && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand font-semibold underline underline-offset-4"
          >
            📍 {freshness === "live" ? t("openBusInMaps") : t("openLastSeenInMaps")}
          </a>
        )}
        <ModeNote mode={mode} />
      </section>
    </div>
  );
}
