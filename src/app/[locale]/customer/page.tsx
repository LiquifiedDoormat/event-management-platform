import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getCustomerOverview } from "@/server/services/dashboard";

export default async function CustomerHome({ params }: PageProps<"/[locale]/customer">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["CUSTOMER"]);
  const [t, tc, hotel] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getCustomerOverview(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{t("customerTitle")}</h1>
      <p className="text-lg">{t("welcome", { name: user.name })}</p>

      {!hotel ? (
        <p className="rounded-lg border-2 border-warn p-4">{t("noHotel")}</p>
      ) : (
        <>
          <section className="rounded-lg border border-line p-4">
            <h2 className="text-xl font-semibold">{t("yourHotel")}</h2>
            <p className="text-lg font-semibold">{hotel.name}</p>
            <p className="text-muted">{hotel.address}</p>
          </section>

          <section className="rounded-lg border border-line p-4 flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{t("yourCoordinator")}</h2>
            {hotel.coordinator ? (
              <>
                <p className="text-lg">{hotel.coordinator.name}</p>
                <a
                  href={`tel:${hotel.coordinator.phone}`}
                  className="min-h-12 inline-flex items-center justify-center rounded-lg bg-ok text-white text-lg font-semibold px-4"
                >
                  📞 {t("call", { name: hotel.coordinator.name })}
                </a>
              </>
            ) : (
              <p>{t("noCoordinator")}</p>
            )}
          </section>

          <section className="rounded-lg border border-line p-4">
            <h2 className="text-xl font-semibold">{t("yourBuses")}</h2>
            {hotel.buses.length === 0 ? (
              <p>{t("noBuses")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {hotel.buses.map((b) => (
                  <li key={b.id} className="text-lg">
                    🚌 {b.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p className="text-muted">{tc("comingSoon")}</p>
    </section>
  );
}
