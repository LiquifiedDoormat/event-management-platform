import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getCoordinatorOverview } from "@/server/services/dashboard";

export default async function CoordinatorHome({ params }: PageProps<"/[locale]/coordinator">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["COORDINATOR"]);
  const [t, tc, { hotel, buses }] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getCoordinatorOverview(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("coordinatorTitle")}</h1>
      <p className="text-lg">{t("welcome", { name: user.name })}</p>

      <section className="rounded-lg border border-line p-4">
        <h2 className="text-xl font-semibold">{t("designatedHotel")}</h2>
        {hotel ? (
          <>
            <p className="text-lg font-semibold">{hotel.name}</p>
            <p className="text-muted">{hotel.address}</p>
          </>
        ) : (
          <p>—</p>
        )}
      </section>

      <section className="rounded-lg border border-line p-4">
        <h2 className="text-xl font-semibold">{t("assignedBuses")}</h2>
        {buses.length === 0 ? (
          <p>{t("noBuses")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {buses.map((b) => (
              <li key={b.id} className="text-lg">
                {b.label} · <span className="text-muted">{b.hotel.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-muted">{tc("comingSoon")}</p>
    </section>
  );
}
