import { getTranslations } from "next-intl/server";

// Shown while a page's data loads, instead of a blank screen.
export default async function Loading() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-lg">
      <span aria-hidden="true" className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-line border-t-brand motion-reduce:animate-none" />
      {t("loading")}
    </div>
  );
}
