import { getTranslations } from "next-intl/server";
import { TextField } from "@/components/ui/Fields";

type Zone = { name: string; capacity: number | null; notes: string | null };

/** Form fields shared by "new zone" and "edit zone". */
export async function ZoneFields({ zone }: { zone?: Zone }) {
  const t = await getTranslations("zones");
  return (
    <>
      <TextField name="name" label={t("name")} defaultValue={zone?.name} required maxLength={120} />
      <TextField name="capacity" label={t("capacity")} defaultValue={zone?.capacity ?? ""} type="number" min={1} inputMode="numeric" hint={t("capacityHint")} />
      <TextField name="notes" label={t("notes")} defaultValue={zone?.notes ?? ""} multiline />
    </>
  );
}
