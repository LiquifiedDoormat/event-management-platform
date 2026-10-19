"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Step = "phone" | "code";
type ErrorKey =
  | "invalid_phone"
  | "invalid_code"
  | "code_expired"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "generic";

const KNOWN_ERRORS = new Set<ErrorKey>([
  "invalid_phone",
  "invalid_code",
  "code_expired",
  "rate_limited",
  "provider_unavailable",
]);

async function post(url: string, body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: ErrorKey }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: unknown }
      | { ok: false; error: { code: string } }
      | null;
    if (json?.ok) return { ok: true, data: json.data };
    const code = json?.error.code as ErrorKey | undefined;
    return { ok: false, error: code && KNOWN_ERRORS.has(code) ? code : "generic" };
  } catch {
    return { ok: false, error: "network" };
  }
}

const inputClass =
  "w-full min-h-14 rounded-lg border-2 border-line px-4 text-xl tracking-wide focus:border-brand outline-none";
const primaryButton =
  "w-full min-h-14 rounded-lg bg-brand text-brand-ink text-lg font-semibold disabled:opacity-60";
const linkButton = "min-h-11 px-2 text-brand font-semibold underline underline-offset-4";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await post("/api/auth/otp/request", { phone });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCode("");
    setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await post("/api/auth/otp/verify", { phone, code });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    // Keep the button disabled while navigating to prevent double submission.
    const { redirectTo, locale } = result.data as { redirectTo: string; locale: "en" | "hi" };
    router.replace(redirectTo, { locale });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="rounded-lg border-2 border-danger bg-red-50 p-4 text-danger font-semibold">
          {t(`errors.${error}`)}
        </p>
      )}

      {step === "phone" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
          <label htmlFor="phone" className="text-lg font-semibold">
            {t("phoneLabel")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-describedby="phone-hint"
            className={inputClass}
          />
          <p id="phone-hint" className="text-muted">
            {t("phoneHint")}
          </p>
          <button type="submit" disabled={busy || !phone.trim()} className={primaryButton}>
            {busy ? t("sending") : t("sendCode")}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
          <p className="rounded-lg bg-blue-50 p-4" role="status">
            {t("codeSent", { phone })}
          </p>
          <label htmlFor="code" className="text-lg font-semibold">
            {t("codeLabel")}
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
          />
          <button type="submit" disabled={busy || code.length < 4} className={primaryButton}>
            {busy ? t("verifying") : t("verify")}
          </button>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={linkButton} onClick={() => sendCode()} disabled={busy}>
              {t("resend")}
            </button>
            <button
              type="button"
              className={linkButton}
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              disabled={busy}
            >
              {t("changeNumber")}
            </button>
          </div>
        </form>
      )}

      <p className="text-muted">{t("help")}</p>
    </div>
  );
}
