import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/current-user";
import { param } from "@/lib/utils/page";
import { roleHome } from "@/server/services/auth";
import { updateLanguageAction } from "@/features/profile/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { SelectField } from "@/components/ui/Fields";
import { BackLink } from "@/components/ui/BackLink";
import { DetailList, Section } from "@/components/ui/Layout";

export default async function ProfilePage({ params, searchParams }: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const saved = param((await searchParams).saved) === "1";
  const [t, tc, tr, hotel, self] = await Promise.all([
    getTranslations("profile"),
    getTranslations("common"),
    getTranslations("roles"),
    user.hotelId ? prisma.hotel.findUnique({ where: { id: user.hotelId }, select: { name: true } }) : Promise.resolve(null),
    user.role === "CUSTOMER" ? prisma.user.findUnique({ where: { id: user.id }, select: { address: true, gender: true } }) : Promise.resolve(null),
  ]);

  return (
    <section className="flex flex-col gap-5">
      <BackLink href={roleHome(user.role)} label={tc("home")} />
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      {saved && (
        <p role="status" className="rounded-lg border-2 border-ok bg-green-50 p-3 font-semibold text-ok">
          ✓ {t("languageSaved")}
        </p>
      )}

      <Section title={t("details")}>
        <DetailList
          items={[
            [t("name"), user.name],
            [t("phone"), user.phone],
            [t("role"), tr(user.role)],
            ...(user.role === "CUSTOMER"
              ? ([
                  [t("hotel"), hotel?.name ?? "—"],
                  [t("gender"), self?.gender ?? "—"],
                  [t("address"), self?.address ?? "—"],
                ] as [string, string][])
              : []),
          ]}
        />
        <p className="text-muted">{t("changeDetailsHelp")}</p>
      </Section>

      <Section title={t("language")}>
        <ActionForm action={updateLanguageAction} submitLabel={t("saveLanguage")}>
          <SelectField
            name="preferredLocale"
            label={t("languageLabel")}
            hint={t("languageHint")}
            defaultValue={user.preferredLocale}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी (Hindi)" },
            ]}
          />
        </ActionForm>
      </Section>
    </section>
  );
}
