import { getTranslations } from "next-intl/server";
import { TextField } from "@/components/ui/Fields";

type Cluster = { name: string };

/** Form fields shared by "new cluster" and "edit cluster". */
export async function ClusterFields({ cluster }: { cluster?: Cluster }) {
  const t = await getTranslations("clusters");
  return <TextField name="name" label={t("name")} defaultValue={cluster?.name} required maxLength={120} />;
}
