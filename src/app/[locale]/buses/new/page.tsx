import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { hotelOptions } from "@/server/services/hotels";
import { param, requireStaff } from "@/lib/utils/page";
import { createBusAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField } from "@/components/ui/Fields";
import { BusFields } from "@/components/buses/BusFields";
import { PageHeader } from "@/components/ui/Layout";

export default async function NewBusPage({ params, searchParams }: PageProps<"/[locale]/buses/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  if (!can(user, "bus.create")) notFound();
  const [t, hotels] = await Promise.all([getTranslations("buses"), hotelOptions(user)]);
  const hotelId = param((await searchParams).hotelId);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("add")} />
      <ActionForm action={createBusAction} submitLabel={t("create")}>
        <SelectField
          name="hotelId"
          label={t("hotel")}
          defaultValue={hotelId}
          emptyLabel={t("chooseHotel")}
          options={hotels.map((h) => ({ value: h.id, label: h.name }))}
        />
        <BusFields />
      </ActionForm>
    </section>
  );
}
