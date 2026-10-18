import { getTranslations } from "next-intl/server";
import { TextField } from "@/components/ui/Fields";

export async function BusFields({ bus }: { bus?: { label: string; registration: string | null; routeNotes: string | null } }) {
  const t = await getTranslations("buses");
  return (
    <>
      <TextField name="label" label={t("label")} hint={t("labelHint")} defaultValue={bus?.label} required maxLength={60} />
      <TextField name="registration" label={t("registration")} hint={t("registrationHint")} defaultValue={bus?.registration ?? ""} maxLength={20} />
      <TextField name="routeNotes" label={t("routeNotes")} defaultValue={bus?.routeNotes ?? ""} multiline />
    </>
  );
}

type Stop = { name: string; address: string | null; latitude: number | null; longitude: number | null; timeNote: string | null };

export async function StopFields({ stop }: { stop?: Stop }) {
  const t = await getTranslations("buses");
  return (
    <>
      <TextField name="name" label={t("stopName")} defaultValue={stop?.name} required maxLength={120} />
      <TextField name="timeNote" label={t("timeNote")} hint={t("timeNoteHint")} defaultValue={stop?.timeNote ?? ""} maxLength={120} />
      <TextField name="address" label={t("stopAddress")} defaultValue={stop?.address ?? ""} />
      <div className="flex flex-wrap gap-3">
        <TextField name="latitude" label={t("latitude")} defaultValue={stop?.latitude ?? ""} inputMode="decimal" />
        <TextField name="longitude" label={t("longitude")} defaultValue={stop?.longitude ?? ""} inputMode="decimal" />
      </div>
    </>
  );
}
