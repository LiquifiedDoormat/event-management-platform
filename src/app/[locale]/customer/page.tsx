import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getCustomerHome, toSnapshot } from "@/server/services/transport";
import { LocationMap } from "@/components/maps/LocationMap";
import { MapsLink, Section } from "@/components/ui/Layout";
import { LiveBusSummary } from "@/components/transport/LiveBus";

// Attendee homepage. Most time-sensitive first: buses, then hotel, then coordinator.
export default async function CustomerHome({ params }: PageProps<"/[locale]/customer">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["CUSTOMER"]);
  const [t, tt, tm, { settings, hotel }] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("transport"),
    getTranslations("maps"),
    getCustomerHome(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold">{t("welcome", { name: user.name })}</h1>
        {user.eventName && <p className="text-lg text-muted">{user.eventName}</p>}
      </div>

      {!hotel ? (
        <p className="rounded-lg border-2 border-warn p-4 text-lg">{t("noHotel")}</p>
      ) : (
        <>
          <Section title={t("yourBuses")}>
            {hotel.buses.length === 0 ? (
              <p>{t("noBuses")}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {hotel.buses.map((b) => {
                  return (
                    <li key={b.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                      <p className="text-2xl font-bold">🚌 {b.label}</p>
                      <LiveBusSummary busId={b.id} initial={toSnapshot(b.id, b.trips[0], b.location)} staleSeconds={settings.staleLocationSeconds} />
                      <Link
                        href={`/track/${b.id}`}
                        className="min-h-12 inline-flex items-center justify-center rounded-lg bg-brand text-brand-ink text-lg font-semibold px-4"
                      >
                        {tt("viewBus", { count: b._count.stops })} ▶
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={t("yourHotel")}>
            <p className="text-xl font-semibold">{hotel.name}</p>
            <p>{hotel.address}</p>
            {hotel.latitude !== null && hotel.longitude !== null && (
              <>
                <LocationMap
                  label={tm("hotelMap", { name: hotel.name })}
                  loadingText={tm("loading")}
                  failedText={tm("failed")}
                  points={[{ id: "hotel", lat: hotel.latitude, lng: hotel.longitude, kind: "hotel", glyph: "H", title: hotel.name }]}
                  fallback={null}
                />
                <MapsLink lat={hotel.latitude} lng={hotel.longitude} label={tm("openInMaps")} />
              </>
            )}
          </Section>

          <Section title={t("yourCoordinator")}>
            {hotel.coordinators.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {hotel.coordinators.map((c) => (
                  <li key={c.phone} className="flex flex-col gap-1">
                    <p className="text-lg">{c.name}</p>
                    <a
                      href={`tel:${c.phone}`}
                      className="min-h-12 self-start inline-flex items-center justify-center rounded-lg bg-ok text-white text-lg font-semibold px-4"
                    >
                      📞 {t("call", { name: c.name })}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("noCoordinator")}</p>
            )}
          </Section>
        </>
      )}
    </section>
  );
}
