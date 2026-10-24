import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/lib/utils/page";
import { PageHeader } from "@/components/ui/Layout";
import { ImportForm } from "@/components/import/ImportForm";
import { IMPORT_ENTITIES, type ImportEntity } from "@/lib/import/entities";

export default async function ImportPage({ params }: PageProps<"/[locale]/import">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const t = await getTranslations("import");
  const allowedEntities: ImportEntity[] = IMPORT_ENTITIES.filter((e) => (e !== "coordinators" && e !== "clusterCoordinators") || user.role === "OWNER");

  return (
    <section className="flex flex-col gap-5">
      <PageHeader title={t("heading")} />
      <p className="text-base text-muted">{t("intro")}</p>
      <ImportForm allowedEntities={allowedEntities} />
    </section>
  );
}
