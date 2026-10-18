"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export function SignOutButton() {
  const t = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="min-h-11 px-3 rounded-md border border-line text-base font-semibold disabled:opacity-60"
    >
      {busy ? t("signingOut") : t("signOut")}
    </button>
  );
}
