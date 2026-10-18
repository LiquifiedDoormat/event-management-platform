import { getTranslations } from "next-intl/server";
import { TextField } from "@/components/ui/Fields";

type Hotel = { name: string; address: string; latitude: number | null; longitude: number | null; notes: string | null };

/** Form fields shared by "new hotel" and "edit hotel". */
export async function HotelFields({ hotel }: { hotel?: Hotel }) {
  const t = await getTranslations("hotels");
  return (
    <>
      <TextField name="name" label={t("name")} defaultValue={hotel?.name} required maxLength={120} />
      <TextField name="address" label={t("address")} defaultValue={hotel?.address} required multiline />
      <div className="flex flex-wrap gap-3">
        <TextField name="latitude" label={t("latitude")} defaultValue={hotel?.latitude ?? ""} inputMode="decimal" />
        <TextField name="longitude" label={t("longitude")} defaultValue={hotel?.longitude ?? ""} inputMode="decimal" />
      </div>
      <p className="text-muted -mt-2">{t("coordsHint")}</p>
      <TextField name="notes" label={t("notes")} defaultValue={hotel?.notes ?? ""} multiline />
    </>
  );
}
