import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { can } from "@/server/policies";
import { requireStaff } from "@/lib/utils/page";
import { createClusterAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { ClusterFields } from "@/components/clusters/ClusterFields";
import { PageHeader } from "@/components/ui/Layout";

export default async function NewClusterPage({ params }: PageProps<"/[locale]/clusters/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  if (!can(user, "cluster.create")) notFound();
  const t = await getTranslations("clusters");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("add")} />
      <ActionForm action={createClusterAction} submitLabel={t("create")}>
        <ClusterFields />
      </ActionForm>
    </section>
  );
}
