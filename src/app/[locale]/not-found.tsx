import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Shown for missing pages and for records the user isn't allowed to see
// (we never reveal which).
export default async function NotFound() {
  const [t, tc] = await Promise.all([getTranslations("errors"), getTranslations("common")]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("notFound")}</h1>
      <p className="text-lg">{t("notFoundHelp")}</p>
      <Link href="/" className="min-h-12 self-start inline-flex items-center rounded-lg bg-brand text-brand-ink text-lg font-semibold px-4">
        🏠 {tc("home")}
      </Link>
    </section>
  );
}
