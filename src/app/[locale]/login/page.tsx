import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { roleHome } from "@/server/services/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (user) redirect({ href: roleHome(user.role), locale });

  const t = await getTranslations("auth");
  return (
    <section className="flex flex-col gap-4 max-w-md">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-lg">{t("intro")}</p>
      <LoginForm />
    </section>
  );
}
