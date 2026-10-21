import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { requireStaff } from "@/lib/utils/page";
import { createZoneAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { ZoneFields } from "@/components/zones/ZoneFields";
import { PageHeader } from "@/components/ui/Layout";

export default async function NewZonePage({ params }: PageProps<"/[locale]/zones/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  if (!can(user, "zone.create")) notFound();
  const t = await getTranslations("zones");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("add")} />
      <ActionForm action={createZoneAction} submitLabel={t("create")}>
        <ZoneFields />
      </ActionForm>
    </section>
  );
}
