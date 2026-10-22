import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { can } from "@/server/policies";
import { getCluster } from "@/server/services/clusters";
import { hotelOptionsWithCluster } from "@/server/services/hotels";
import { clusterCoordinatorOptions } from "@/server/services/people";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import {
  addClusterCoordinatorAction,
  addClusterHotelAction,
  removeClusterCoordinatorAction,
  removeClusterHotelAction,
  updateClusterAction,
} from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField } from "@/components/ui/Fields";
import { Badge, DetailList, PageHeader, Section } from "@/components/ui/Layout";
import { ClusterFields } from "@/components/clusters/ClusterFields";

export default async function ClusterDetailPage({ params }: PageProps<"/[locale]/clusters/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const cluster = await orNotFound(getCluster(user, id));
  const canManageHotels = can(user, "cluster.manageHotels");
  const canManageCoordinators = can(user, "cluster.manageCoordinators");
  const [t, tc, format, hotelChoices, coordinatorChoices] = await Promise.all([
    getTranslations("clusters"),
    getTranslations("common"),
    getFormatter(),
    canManageHotels ? hotelOptionsWithCluster(user) : Promise.resolve([]),
    canManageCoordinators ? clusterCoordinatorOptions(user) : Promise.resolve([]),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/clusters" label={t("title")} />
      <PageHeader title={cluster.name} />

      <Section title={t("details")}>
        <DetailList items={[[tc("updated"), format.dateTime(cluster.updatedAt, { dateStyle: "medium", timeStyle: "short" })]]} />
      </Section>

      <Section title={t("hotels")}>
        {cluster.hotels.length === 0 ? (
          <p>{t("noHotels")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cluster.hotels.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <Link href={`/hotels/${h.id}`} className="text-lg text-brand font-semibold underline">
                  {h.name}
                </Link>
                <span className="text-muted">{t("hotelSummary", { buses: h.busCount, coordinators: h.coordinators.length })}</span>
                {!h.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}
                {canManageHotels && (
                  <ActionForm action={removeClusterHotelAction} hidden={{ id: cluster.id, hotelId: h.id }} submitLabel={t("remove")} tone="danger" inline />
                )}
              </li>
            ))}
          </ul>
        )}
        {canManageHotels && (
          <ActionForm action={addClusterHotelAction} hidden={{ id: cluster.id }} submitLabel={t("addHotel")} inline resetOnSuccess>
            <SelectField
              name="hotelId"
              label={t("chooseHotel")}
              emptyLabel={t("choose")}
              hint={t("hotelMoveHint")}
              options={hotelChoices.map((h) => ({
                value: h.id,
                label: h.currentCluster ? `${h.name} (${h.currentCluster.name})` : h.name,
              }))}
            />
          </ActionForm>
        )}
      </Section>

      <Section title={t("coordinators")}>
        {cluster.coordinators.length === 0 ? (
          <Badge tone="warn">⚠ {t("noCoordinators")}</Badge>
        ) : (
          <ul className="flex flex-col gap-2">
            {cluster.coordinators.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/people/${c.id}`} className="text-lg text-brand font-semibold underline">
                  {c.name}
                </Link>
                <a href={`tel:${c.phone}`} className="underline">📞 {c.phone}</a>
                {c.status === "INACTIVE" && <Badge tone="danger">{tc("inactive")}</Badge>}
                {canManageCoordinators && (
                  <ActionForm
                    action={removeClusterCoordinatorAction}
                    hidden={{ id: cluster.id, coordinatorId: c.id }}
                    submitLabel={t("remove")}
                    tone="danger"
                    inline
                    confirmMessage={t("confirmRemoveCoordinator", { name: c.name })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canManageCoordinators && (
          <ActionForm action={addClusterCoordinatorAction} hidden={{ id: cluster.id }} submitLabel={t("assign")} inline resetOnSuccess>
            <SelectField
              name="coordinatorId"
              label={t("chooseCoordinator")}
              emptyLabel={t("choose")}
              hint={t("coordinatorMoveHint")}
              options={coordinatorChoices.map((c) => ({
                value: c.id,
                label: c.coordinatedCluster ? `${c.name} (${c.coordinatedCluster.name})` : c.name,
              }))}
            />
          </ActionForm>
        )}
      </Section>

      {can(user, "cluster.update") && (
        <Section title={t("edit")}>
          <ActionForm action={updateClusterAction} hidden={{ id: cluster.id }} submitLabel={tc("save")}>
            <ClusterFields cluster={cluster} />
          </ActionForm>
        </Section>
      )}
    </section>
  );
}
