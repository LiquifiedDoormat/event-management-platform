"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Mode = "attendee" | "staff" | "setup";
type ErrorKey = "invalid_credentials" | "no_event_access" | "weak_pin" | "pin_mismatch" | "rate_limited" | "network" | "generic" | "choose_event";
const KNOWN = new Set<string>(["invalid_credentials", "no_event_access", "weak_pin", "pin_mismatch", "rate_limited"]);

async function post(url: string, body: unknown): Promise<{ ok: true; data: { redirectTo: string; locale: "en" | "hi" } } | { ok: false; error: ErrorKey }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as { ok: boolean; data?: { redirectTo: string; locale: "en" | "hi" }; error?: { code: string } } | null;
    if (json?.ok && json.data) return { ok: true, data: json.data };
    const code = json?.error?.code;
    return { ok: false, error: code && KNOWN.has(code) ? (code as ErrorKey) : "generic" };
  } catch {
    return { ok: false, error: "network" };
  }
}

const inputClass = "w-full min-h-14 rounded-lg border-2 border-line bg-surface px-4 text-xl tracking-wide focus:border-brand outline-none";
const primary = "w-full min-h-14 rounded-lg bg-brand text-brand-ink text-lg font-semibold disabled:opacity-60";
const linkButton = "min-h-11 px-1 text-left text-brand font-semibold underline underline-offset-4";

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-lg font-semibold">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-muted">{hint}</p>}
    </div>
  );
}

const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/**
 * Sign-in without SMS. Attendees: event + phone.
 * Staff/coordinators: event + phone + PIN; first time or after a reset: setup code + new PIN.
 */
export function LoginForm({ events }: { events: { id: string; name: string }[] }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("attendee");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!eventId && (mode === "attendee" || events.length > 0)) return setError("choose_event");
    setBusy(true);
    setError(null);
    const event = eventId || null;
    const result =
      mode === "attendee"
        ? await post("/api/auth/attendee", { eventId: event, phone })
        : mode === "staff"
          ? await post("/api/auth/pin", { eventId: event, phone, pin })
          : await post("/api/auth/setup-pin", { eventId: event, phone, setupCode: code, pin, pinConfirm });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    // Stay disabled while navigating (no double submission).
    router.replace(result.data.redirectTo, { locale: result.data.locale });
    router.refresh();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPin("");
    setPinConfirm("");
    setCode("");
  }

  const tab = (m: Mode, label: string) => {
    const selected = mode === m || (m === "staff" && mode === "setup");
    return (
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => switchMode(m)}
        className={`min-h-12 flex-1 rounded-lg border-2 px-3 text-base font-semibold ${selected ? "border-brand bg-brand text-brand-ink" : "border-line"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field label={t("event")}>
        {(id) =>
          events.length === 0 ? (
            <p id={id} className="rounded-lg border-2 border-line p-3">
              {t("noEvents")}
            </p>
          ) : (
            <select id={id} value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass} required>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          )
        }
      </Field>

      <div role="tablist" aria-label={t("whoAreYou")} className="flex gap-2">
        {tab("attendee", t("attendeeTab"))}
        {tab("staff", t("staffTab"))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-danger bg-red-50 p-4 font-semibold text-danger">
          {t(`errors.${error}`)}
        </p>
      )}

      <Field label={t("phoneLabel")} hint={t("phoneHint")}>
        {(id) => <input id={id} type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />}
      </Field>


      {mode === "setup" && (
        <Field label={t("setupCodeLabel")} hint={t("setupCodeHint")}>
          {(id) => <input id={id} type="text" autoComplete="one-time-code" autoCapitalize="characters" required value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />}
        </Field>
      )}

      {mode !== "attendee" && (
        <Field label={mode === "setup" ? t("newPinLabel") : t("pinLabel")} hint={mode === "setup" ? t("newPinHint") : undefined}>
          {(id) => (
            <input
              id={id}
              type="password"
              inputMode="numeric"
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              className={`${inputClass} tracking-[0.5em]`}
            />
          )}
        </Field>
      )}

      {mode === "setup" && (
        <Field label={t("confirmPinLabel")}>
          {(id) => (
            <input
              id={id}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              required
              value={pinConfirm}
              onChange={(e) => setPinConfirm(digitsOnly(e.target.value))}
              className={`${inputClass} tracking-[0.5em]`}
            />
          )}
        </Field>
      )}

      <button type="submit" disabled={busy || !phone.trim() || (mode !== "attendee" && pin.length !== 6)} className={primary}>
        {busy ? t("signingIn") : mode === "setup" ? t("setPinAndSignIn") : t("signIn")}
      </button>

      {mode === "staff" && (
        <button type="button" className={linkButton} onClick={() => switchMode("setup")}>
          {t("firstTime")}
        </button>
      )}
      {mode === "setup" && (
        <button type="button" className={linkButton} onClick={() => switchMode("staff")}>
          {t("haveAPin")}
        </button>
      )}

      <p className="text-muted">{mode === "attendee" ? t("attendeeHelp") : t("forgotPin")}</p>
    </form>
  );
}
