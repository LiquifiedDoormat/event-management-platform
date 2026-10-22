import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { requireUser } from "@/lib/auth/current-user";
import { activeTripsFor } from "@/server/services/trips";
import { TripControls } from "@/components/trips/TripControls";

export default async function TripPage({ params }: PageProps<"/[locale]/coordinator/trip/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["COORDINATOR"]);
  // Only the coordinator's own active trip; ended or other trips → 404.
  const trip = (await activeTripsFor(user)).find((tr) => tr.id === id);
  if (!trip) notFound();
  const t = await getTranslations("trip");

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/coordinator" label={t("back")} />
      <div>
        <h1 className="text-3xl font-bold">🚌 {trip.bus.label}</h1>
        <p className="text-lg text-muted">🏨 {trip.bus.hotel.name}</p>
      </div>
      <TripControls
        tripId={trip.id}
        initialStatus={trip.status}
        initialVersion={trip.statusVersion}
        initialChangedAt={trip.statusChangedAt.toISOString()}
        initialDelayed={trip.isDelayed}
      />
      <Link href={`/track/${trip.busId}`} className="text-brand font-semibold underline">
        👁 {t("viewAsAttendee")}
      </Link>
    </section>
  );
}
