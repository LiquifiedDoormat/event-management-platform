"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Shown when a page fails to load (e.g. database briefly unavailable). Never
// shows technical details; offers to try again or go home.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  return (
    <section role="alert" className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">⚠ {t("pageFailed")}</h1>
      <p className="text-lg">{t("pageFailedHelp")}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={retry} className="min-h-12 rounded-lg bg-brand px-5 text-lg font-semibold text-brand-ink">
          🔄 {t("tryAgain")}
        </button>
        <Link href="/" className="min-h-12 inline-flex items-center rounded-lg border-2 border-line px-5 text-lg font-semibold">
          🏠 {tc("home")}
        </Link>
      </div>
    </section>
  );
}
