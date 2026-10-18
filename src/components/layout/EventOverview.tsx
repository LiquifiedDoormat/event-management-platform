import { getTranslations } from "next-intl/server";
import { StatTile } from "./StatTile";
import type { getEventOverview } from "@/server/services/dashboard";

type Overview = Awaited<ReturnType<typeof getEventOverview>>;

/** Shared Owner/Admin summary: totals plus missing assignments. */
export async function EventOverview({ overview }: { overview: Overview }) {
  const t = await getTranslations("dashboard");
  const issues = overview.hotelsWithoutCoordinator + overview.attendeesWithoutHotel;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label={t("hotels")} value={overview.hotels} />
        <StatTile label={t("buses")} value={overview.buses} />
        <StatTile label={t("attendees")} value={overview.attendees} />
        <StatTile label={t("coordinators")} value={overview.coordinators} />
      </div>
      <section className="rounded-lg border border-line p-4 flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t("needsAttention")}</h2>
        {issues === 0 ? (
          <p>{t("allAssigned")}</p>
        ) : (
          <ul className="list-disc pl-6">
            {overview.hotelsWithoutCoordinator > 0 && (
              <li>{t("hotelsWithoutCoordinator", { count: overview.hotelsWithoutCoordinator })}</li>
            )}
            {overview.attendeesWithoutHotel > 0 && (
              <li>{t("attendeesWithoutHotel", { count: overview.attendeesWithoutHotel })}</li>
            )}
          </ul>
        )}
      </section>
    </>
  );
}
