import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { can } from "@/server/policies";
import { getHotel } from "@/server/services/hotels";
import { coordinatorOptions } from "@/server/services/people";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import { addHotelCoordinatorAction, removeHotelCoordinatorAction, setHotelActiveAction, updateHotelAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField } from "@/components/ui/Fields";
import { Badge, DetailList, MapsLink, PageHeader, Section } from "@/components/ui/Layout";
import { HotelFields } from "@/components/hotels/HotelFields";

export default async function HotelDetailPage({ params }: PageProps<"/[locale]/hotels/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const hotel = await orNotFound(getHotel(user, id));
  const canAssign = can(user, "hotel.manageCoordinators");
  const [t, tc, format, coordinators] = await Promise.all([
    getTranslations("hotels"),
    getTranslations("common"),
    getFormatter(),
    canAssign ? coordinatorOptions(user) : Promise.resolve([]),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/hotels" label={t("title")} />
      <PageHeader title={hotel.name} />
      {!hotel.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}

      <Section title={t("details")}>
        <DetailList
          items={[
            [t("address"), hotel.address],
            [
              t("location"),
              hotel.latitude !== null && hotel.longitude !== null ? (
                <MapsLink lat={hotel.latitude} lng={hotel.longitude} label={t("openMap")} />
              ) : (
                t("noLocation")
              ),
            ],
            [t("attendees"), <Link key="a" href={`/people?role=CUSTOMER&hotelId=${hotel.id}`} className="text-brand font-semibold underline">{hotel._count.members}</Link>],
            [t("notes"), hotel.notes || "—"],
            [tc("updated"), format.dateTime(hotel.updatedAt, { dateStyle: "medium", timeStyle: "short" })],
          ]}
        />
      </Section>

      <Section title={t("coordinators")}>
        {hotel.coordinators.length === 0 ? (
          <Badge tone="warn">⚠ {t("noCoordinator")}</Badge>
        ) : (
          <ul className="flex flex-col gap-2">
            {hotel.coordinators.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/coordinators/${c.id}`} className="text-lg text-brand font-semibold underline">
                  {c.name}
                </Link>
                <a href={`tel:${c.phone}`} className="underline">📞 {c.phone}</a>
                {canAssign && (
                  <ActionForm
                    action={removeHotelCoordinatorAction}
                    hidden={{ id: hotel.id, coordinatorId: c.id }}
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
        {canAssign && (
          <ActionForm action={addHotelCoordinatorAction} hidden={{ id: hotel.id }} submitLabel={t("assign")} inline resetOnSuccess>
            <SelectField
              name="coordinatorId"
              label={t("chooseCoordinator")}
              emptyLabel={t("choose")}
              hint={t("moveHint")}
              options={coordinators.map((c) => ({
                value: c.id,
                label: c.coordinatedHotel ? `${c.name} (${c.coordinatedHotel.name})` : c.name,
              }))}
            />
          </ActionForm>
        )}
      </Section>

      <Section title={t("buses")}>
        {hotel.buses.length === 0 ? (
          <p>{t("noBuses")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {hotel.buses.map((b) => (
              <li key={b.id}>
                <Link href={`/buses/${b.id}`} className="text-lg text-brand font-semibold underline">
                  🚌 {b.label}
                </Link>{" "}
                {b.registration && <span className="text-muted">{b.registration}</span>}{" "}
                {!b.isActive && <Badge tone="danger">{tc("inactive")}</Badge>}
              </li>
            ))}
          </ul>
        )}
        {can(user, "bus.create") && hotel.isActive && (
          <Link href={`/buses/new?hotelId=${hotel.id}`} className="text-brand font-semibold underline">
            ＋ {t("addBus")}
          </Link>
        )}
      </Section>

      {can(user, "hotel.update") && (
        <Section title={t("edit")}>
          <ActionForm action={updateHotelAction} hidden={{ id: hotel.id }} submitLabel={tc("save")}>
            <HotelFields hotel={hotel} />
          </ActionForm>
        </Section>
      )}

      {can(user, "hotel.deactivate") && (
        <Section title={tc("status")}>
          <ActionForm
            action={setHotelActiveAction}
            hidden={{ id: hotel.id, active: String(!hotel.isActive) }}
            submitLabel={hotel.isActive ? t("deactivate") : t("activate")}
            confirmMessage={hotel.isActive ? t("confirmDeactivate") : undefined}
            tone={hotel.isActive ? "danger" : "secondary"}
          />
        </Section>
      )}
    </section>
  );
}
