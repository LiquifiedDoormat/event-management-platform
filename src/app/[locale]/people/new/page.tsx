import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { assignableRoles } from "@/server/policies";
import { hotelOptions } from "@/server/services/hotels";
import { param, requireStaff } from "@/lib/utils/page";
import { createPersonAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField, TextField } from "@/components/ui/Fields";
import { PageHeader } from "@/components/ui/Layout";

export default async function NewPersonPage({ params, searchParams }: PageProps<"/[locale]/people/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const roles = assignableRoles(user);
  if (roles.length === 0) notFound();
  const sp = await searchParams;
  const [t, tr, hotels] = await Promise.all([getTranslations("people"), getTranslations("roles"), hotelOptions(user)]);
  const role = param(sp.role);

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("add")} />
      <p>{t("addIntro")}</p>
      <ActionForm action={createPersonAction} submitLabel={t("create")}>
        <TextField name="name" label={t("name")} required maxLength={120} />
        <TextField name="phone" label={t("phone")} type="tel" inputMode="tel" required hint={t("phoneHint")} />
        <SelectField
          name="role"
          label={t("role")}
          defaultValue={role && (roles as string[]).includes(role) ? role : "CUSTOMER"}
          options={roles.map((r) => ({ value: r, label: tr(r) }))}
        />
        <SelectField name="hotelId" label={t("hotel")} hint={t("hotelHint")} emptyLabel={t("noHotel")} options={hotels.map((h) => ({ value: h.id, label: h.name }))} />
        <TextField name="address" label={t("address")} hint={t("hotelHint")} multiline />
      </ActionForm>
    </section>
  );
}
