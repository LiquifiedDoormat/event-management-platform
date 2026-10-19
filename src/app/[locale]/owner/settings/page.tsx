import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth/current-user";
import { getSettings } from "@/server/services/settings";
import { updateSettingsAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { TextField } from "@/components/ui/Fields";
import { BackLink } from "@/components/ui/BackLink";

export default async function SettingsPage({ params }: PageProps<"/[locale]/owner/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER"]);
  const [t, tc, format, settings] = await Promise.all([
    getTranslations("settings"),
    getTranslations("common"),
    getFormatter(),
    getSettings(user),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href="/owner" label={tc("home")} />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      {settings.updatedAt && <p className="text-muted">{tc("updated")}: {format.dateTime(settings.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</p>}
      <ActionForm action={updateSettingsAction} submitLabel={tc("save")}>
        <TextField name="eventName" label={t("eventName")} hint={t("eventNameHint")} defaultValue={settings.eventName} required maxLength={120} />
        <TextField name="staleLocationSeconds" label={t("stale")} hint={t("staleHint")} defaultValue={settings.staleLocationSeconds} inputMode="numeric" />
        <TextField name="historySampleSeconds" label={t("sample")} hint={t("sampleHint")} defaultValue={settings.historySampleSeconds} inputMode="numeric" />
        <TextField name="locationRetentionDays" label={t("retention")} hint={t("retentionHint")} defaultValue={settings.locationRetentionDays} inputMode="numeric" />
      </ActionForm>
    </section>
  );
}
