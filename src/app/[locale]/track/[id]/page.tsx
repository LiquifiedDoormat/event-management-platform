import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { orNotFound } from "@/lib/utils/page";
import { locationFreshness } from "@/lib/transport/status";
import type { MapPoint } from "@/lib/maps/config";
import { isStaff } from "@/server/policies";
import { roleHome } from "@/server/services/auth";
import { getTrackedBus } from "@/server/services/transport";
import { LocationMap } from "@/components/maps/LocationMap";
import { MapsLink, Section } from "@/components/ui/Layout";
import { BusStatusPanel, LocationFreshnessNote } from "@/components/transport/StatusParts";
import { RefreshButton } from "@/components/transport/RefreshButton";

// Attendee-facing view of one bus: status, position, stops. Access: policy canViewBus.
export default async function TrackBusPage({ params }: PageProps<"/[locale]/track/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const { bus, settings } = await orNotFound(getTrackedBus(user, id));
  const [tt, tm, tb, format] = await Promise.all([
    getTranslations("transport"),
    getTranslations("maps"),
    getTranslations("buses"),
    getFormatter(),
  ]);
  const trip = bus.trips[0];
  const freshness = locationFreshness(bus.location?.recordedAt, settings.staleLocationSeconds);

  const points: MapPoint[] = [];
  if (bus.hotel.latitude !== null && bus.hotel.longitude !== null) {
    points.push({ id: "hotel", lat: bus.hotel.latitude, lng: bus.hotel.longitude, kind: "hotel", glyph: "H", title: bus.hotel.name });
  }
  for (const s of bus.stops) {
    if (s.latitude !== null && s.longitude !== null) {
      points.push({ id: s.id, lat: s.latitude, lng: s.longitude, kind: "stop", glyph: String(s.sequence), title: s.name });
    }
  }
  if (bus.location && freshness !== "none") {
    points.push({
      id: "bus",
      lat: bus.location.latitude,
      lng: bus.location.longitude,
      kind: freshness === "live" ? "bus" : "busStale",
      glyph: "🚌",
      title: freshness === "live" ? tt("busHere") : tt("busLastSeen"),
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <Link href={isStaff(user) ? `/buses/${bus.id}` : roleHome(user.role)} className="text-brand font-semibold">
        ◀ {tt("back")}
      </Link>
      <div>
        <h1 className="text-3xl font-bold">🚌 {bus.label}</h1>
        <p className="text-lg text-muted">
          🏨 {bus.hotel.name}
          {bus.registration && ` · ${bus.registration}`}
        </p>
      </div>

      <BusStatusPanel status={trip?.status ?? null} since={trip?.statusChangedAt ?? null} />

      <Section title={tt("location")}>
        <LocationFreshnessNote freshness={freshness} recordedAt={bus.location?.recordedAt ?? null} />
        {trip && !trip.sharingLocation && <p className="text-muted">{tt("sharingOff")}</p>}
        <LocationMap
          label={tm("busMap", { bus: bus.label })}
          loadingText={tm("loading")}
          failedText={tm("failed")}
          points={points}
          fallback={<p className="text-muted">{tm("unavailable")}</p>}
        />
        {bus.location && freshness !== "none" && (
          <MapsLink lat={bus.location.latitude} lng={bus.location.longitude} label={freshness === "live" ? tt("openBusInMaps") : tt("openLastSeenInMaps")} />
        )}
        <p className="text-muted">
          {tt("lastChecked", { time: format.dateTime(new Date(), { timeStyle: "short" }) })}
        </p>
        <div>
          <RefreshButton label={tt("refresh")} busyLabel={tt("refreshing")} />
        </div>
      </Section>

      {trip && (
        <Section title={tt("onBoard")}>
          <p className="text-lg">{trip.coordinator.name}</p>
          <a
            href={`tel:${trip.coordinator.phone}`}
            className="min-h-12 self-start inline-flex items-center justify-center rounded-lg bg-ok text-white text-lg font-semibold px-4"
          >
            📞 {tt("callCoordinator", { name: trip.coordinator.name })}
          </a>
        </Section>
      )}

      <Section title={tb("stops")}>
        {bus.stops.length === 0 ? (
          <p>{tb("noStops")}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {bus.stops.map((s) => (
              <li key={s.id} className="rounded-lg border border-line p-3 flex flex-col gap-1">
                <p className="text-lg font-semibold">
                  {s.sequence}. {s.name}
                </p>
                {s.timeNote && <p>🕒 {s.timeNote}</p>}
                {s.address && <p className="text-muted">{s.address}</p>}
                {s.latitude !== null && s.longitude !== null && <MapsLink lat={s.latitude} lng={s.longitude} label={tm("openInMaps")} />}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </section>
  );
}
