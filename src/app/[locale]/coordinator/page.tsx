import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getCoordinatorOverview } from "@/server/services/dashboard";
import { activeTripsFor } from "@/server/services/trips";
import { startTripAction } from "@/features/trips/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Badge, Section } from "@/components/ui/Layout";

export default async function CoordinatorHome({ params }: PageProps<"/[locale]/coordinator">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["COORDINATOR"]);
  const [t, tt, ts, { hotel, buses }, trips] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("trip"),
    getTranslations("busStatus"),
    getCoordinatorOverview(user),
    activeTripsFor(user.id),
  ]);
  const active = trips[0];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("welcome", { name: user.name })}</h1>

      {active && (
        <Section title={tt("activeTrip")}>
          <p className="text-2xl font-bold">🚌 {active.bus.label}</p>
          <p>
            <Badge tone="ok">{ts(active.status)}</Badge> {active.sharingLocation ? `· 📡 ${tt("sharingOn")}` : `· ⏸ ${tt("sharingOff")}`}
          </p>
          <Link
            href={`/coordinator/trip/${active.id}`}
            className="min-h-16 inline-flex items-center justify-center rounded-xl bg-brand text-brand-ink text-xl font-bold px-4"
          >
            {tt("openControls")} ▶
          </Link>
        </Section>
      )}

      <Section title={t("assignedBuses")}>
        {buses.length === 0 ? (
          <p>{t("noBuses")}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {buses.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <p className="text-xl font-semibold">
                  🚌 {b.label} <span className="text-base font-normal text-muted">· {b.hotel.name}</span>
                </p>
                {!active && <ActionForm action={startTripAction} hidden={{ busId: b.id }} submitLabel={`▶ ${tt("startTrip")}`} />}
                <Link href={`/track/${b.id}`} className="text-brand font-semibold underline">
                  👁 {tt("viewAsAttendee")}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {active && <p className="text-muted">{tt("oneTripAtATime")}</p>}
      </Section>

      <Section title={t("designatedHotel")}>
        {hotel ? (
          <>
            <p className="text-lg font-semibold">{hotel.name}</p>
            <p className="text-muted">{hotel.address}</p>
          </>
        ) : (
          <p>—</p>
        )}
      </Section>
    </section>
  );
}
