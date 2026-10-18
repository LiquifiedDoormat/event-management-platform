import { getFormatter, getTranslations } from "next-intl/server";
import type { BusStatus } from "@/generated/prisma/enums";
import { STATUS_ICON, STATUS_KIND, type Freshness } from "@/lib/transport/status";

const KIND_STYLE = {
  boarding: "border-warn bg-amber-50 text-warn",
  moving: "border-brand bg-blue-50 text-brand",
  arrived: "border-ok bg-green-50 text-ok",
} as const;

/** Large, high-contrast bus status: icon + words + when it changed. */
export async function BusStatusPanel({
  status,
  since,
  size = "large",
}: {
  status: BusStatus | null;
  since: Date | null;
  size?: "large" | "compact";
}) {
  const [t, ts, format] = await Promise.all([getTranslations("transport"), getTranslations("busStatus"), getFormatter()]);
  const text = size === "large" ? "text-2xl" : "text-lg";
  if (!status) {
    return <p className={`rounded-lg border-2 border-line p-3 font-semibold ${text}`}>⏸ {t("notRunning")}</p>;
  }
  const kind = STATUS_KIND[status];
  return (
    <div className={`rounded-lg border-2 p-3 ${KIND_STYLE[kind]}`}>
      <p className={`font-bold ${text}`}>
        <span aria-hidden="true">{STATUS_ICON[kind]} </span>
        {ts(status)}
      </p>
      {since && (
        <p className="text-ink">
          {t("statusSince", { time: format.dateTime(since, { timeStyle: "short" }), ago: format.relativeTime(since) })}
        </p>
      )}
    </div>
  );
}

/** Says plainly whether the bus position is current, old, or missing. */
export async function LocationFreshnessNote({ freshness, recordedAt }: { freshness: Freshness; recordedAt: Date | null }) {
  const [t, format] = await Promise.all([getTranslations("transport"), getFormatter()]);
  if (freshness === "none" || !recordedAt) return <p className="text-muted">📡 {t("locationNone")}</p>;
  const ago = format.relativeTime(recordedAt);
  return freshness === "live" ? (
    <p className="font-semibold text-ok">📡 {t("locationLive", { ago })}</p>
  ) : (
    <p className="font-semibold text-warn">⚠ {t("locationStale", { ago })}</p>
  );
}
