import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getCoordinatorOverview } from "@/server/services/dashboard";
import { activeTripsFor } from "@/server/services/trips";
import { startTripAction } from "@/features/trips/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField } from "@/components/ui/Fields";
import { Badge, Section } from "@/components/ui/Layout";
import { STATUS_BADGE_TONE, STATUS_KIND } from "@/lib/transport/status";

export default async function CoordinatorHome({ params }: PageProps<"/[locale]/coordinator">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["COORDINATOR"]);
  const [t, tt, ts, ta, { hotel, buses }, trips] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("trip"),
    getTranslations("busStatus"),
    getTranslations("attendance"),
    getCoordinatorOverview(user),
    activeTripsFor(user),
  ]);
  const active = trips[0];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("welcome", { name: user.name })}</h1>
      <Link
        href="/coordinator/people"
        className="min-h-14 inline-flex items-center rounded-lg border-2 border-brand px-4 text-lg font-semibold text-brand"
      >
        <span aria-hidden="true">👥&nbsp;</span>
        {t("myAttendees")}
      </Link>

      {active && (
        <Section title={tt("activeTrip")}>
          <p className="text-2xl font-bold">🚌 {active.bus.label}</p>
          <p>
            <Badge tone={STATUS_BADGE_TONE[STATUS_KIND[active.status]]}>{ts(active.status)}</Badge>{" "}
            {active.isDelayed && <Badge tone="danger">⚠ {tt("delayed")}</Badge>}{" "}
            {active.sharingLocation ? `· 📡 ${tt("sharingOn")}` : `· ⏸ ${tt("sharingOff")}`}
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
                {!active && (
                  <ActionForm action={startTripAction} hidden={{ busId: b.id }} submitLabel={`▶ ${tt("startTrip")}`} inline>
                    <SelectField
                      name="startStatus"
                      label={tt("startDirection")}
                      defaultValue="BOARDING_AT_VENUE"
                      options={[
                        { value: "BOARDING_AT_VENUE", label: ts("BOARDING_AT_VENUE") },
                        { value: "BOARDING_AT_HOTEL", label: ts("BOARDING_AT_HOTEL") },
                      ]}
                    />
                  </ActionForm>
                )}
                <Link href={`/track/${b.id}`} className="text-brand font-semibold underline">
                  👁 {tt("viewAsAttendee")}
                </Link>
                <Link href={`/coordinator/manifest/${b.id}`} className="text-brand font-semibold underline">
                  📋 {ta("manifestTitle")}
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
