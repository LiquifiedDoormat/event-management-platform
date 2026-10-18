import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { requireStaff } from "@/lib/utils/page";
import { createHotelAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { HotelFields } from "@/components/hotels/HotelFields";
import { PageHeader } from "@/components/ui/Layout";

export default async function NewHotelPage({ params }: PageProps<"/[locale]/hotels/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  if (!can(user, "hotel.create")) notFound();
  const t = await getTranslations("hotels");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("add")} />
      <ActionForm action={createHotelAction} submitLabel={t("create")}>
        <HotelFields />
      </ActionForm>
    </section>
  );
}
