"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Tab = "attendee" | "staff";
/** Staff flow: phone first, then either enter the PIN or choose one. */
type StaffStep = "phone" | "pin" | "setup";
type ErrorKey = "invalid_credentials" | "no_event_access" | "weak_pin" | "pin_mismatch" | "rate_limited" | "network" | "generic" | "choose_event";
const KNOWN = new Set<string>(["invalid_credentials", "no_event_access", "weak_pin", "pin_mismatch", "rate_limited"]);

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ErrorKey }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { code: string } } | null;
    if (json?.ok && json.data) return { ok: true, data: json.data };
    const code = json?.error?.code;
    return { ok: false, error: code && KNOWN.has(code) ? (code as ErrorKey) : "generic" };
  } catch {
    return { ok: false, error: "network" };
  }
}

type Session = { redirectTo: string; locale: "en" | "hi" };

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

function PinInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <input
      id={id}
      type="password"
      inputMode="numeric"
      autoComplete={autoComplete}
      maxLength={6}
      required
      value={value}
      onChange={(e) => onChange(digitsOnly(e.target.value))}
      className={`${inputClass} tracking-[0.5em]`}
    />
  );
}

/**
 * Sign-in without SMS. Attendees: event + phone number.
 * Staff/coordinators: event + phone → enter PIN, or choose one if the account has none yet.
 */
export function LoginForm({ events }: { events: { id: string; name: string }[] }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attendee");
  const [step, setStep] = useState<StaffStep>("phone");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  function finish(result: { ok: true; data: Session } | { ok: false; error: ErrorKey }) {
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    // Stay disabled while navigating (no double submission).
    router.replace(result.data.redirectTo, { locale: result.data.locale });
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!eventId && (tab === "attendee" || events.length > 0)) return setError("choose_event");
    setBusy(true);
    setError(null);
    const event = eventId || null;

    if (tab === "attendee") return finish(await post<Session>("/api/auth/attendee", { eventId: event, phone }));
    if (step === "phone") {
      const status = await post<{ next: "enter_pin" | "needs_pin" }>("/api/auth/pin-status", { phone });
      setBusy(false);
      if (!status.ok) return setError(status.error);
      return setStep(status.data.next === "needs_pin" ? "setup" : "pin");
    }
    if (step === "pin") return finish(await post<Session>("/api/auth/pin", { eventId: event, phone, pin }));
    return finish(await post<Session>("/api/auth/setup-pin", { eventId: event, phone, pin, pinConfirm }));
  }

  function reset(nextTab: Tab = tab) {
    setTab(nextTab);
    setStep("phone");
    setError(null);
    setPin("");
    setPinConfirm("");
  }

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => reset(value)}
      className={`min-h-12 flex-1 rounded-lg border-2 px-3 text-base font-semibold ${tab === value ? "border-brand bg-brand text-brand-ink" : "border-line"}`}
    >
      {label}
    </button>
  );

  const staffPhoneLocked = tab === "staff" && step !== "phone";
  const canSubmit =
    !busy && phone.trim() !== "" && (tab === "attendee" || step === "phone" || (pin.length === 6 && (step === "pin" || pinConfirm.length === 6)));
  const submitLabel = busy
    ? t("signingIn")
    : tab === "staff" && step === "phone"
      ? t("continue")
      : step === "setup" && tab === "staff"
        ? t("setPinAndSignIn")
        : t("signIn");

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
        {tabButton("attendee", t("attendeeTab"))}
        {tabButton("staff", t("staffTab"))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-danger bg-red-50 p-4 font-semibold text-danger">
          {t(`errors.${error}`)}
        </p>
      )}

      <Field label={t("phoneLabel")} hint={staffPhoneLocked ? undefined : t("phoneHint")}>
        {(id) => (
          <input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            readOnly={staffPhoneLocked}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${inputClass} ${staffPhoneLocked ? "bg-gray-50" : ""}`}
          />
        )}
      </Field>

      {tab === "staff" && step === "pin" && (
        <Field label={t("pinLabel")}>{(id) => <PinInput id={id} value={pin} onChange={setPin} autoComplete="current-password" />}</Field>
      )}

      {tab === "staff" && step === "setup" && (
        <>
          <p role="status" className="rounded-lg bg-blue-50 p-4">
            {t("choosePinIntro")}
          </p>
          <Field label={t("newPinLabel")} hint={t("newPinHint")}>
            {(id) => <PinInput id={id} value={pin} onChange={setPin} autoComplete="new-password" />}
          </Field>
          <Field label={t("confirmPinLabel")}>{(id) => <PinInput id={id} value={pinConfirm} onChange={setPinConfirm} autoComplete="new-password" />}</Field>
        </>
      )}

      <button type="submit" disabled={!canSubmit} className={primary}>
        {submitLabel}
      </button>

      {staffPhoneLocked && (
        <button type="button" className={linkButton} onClick={() => reset()}>
          {t("changeNumber")}
        </button>
      )}

      <p className="text-muted">{tab === "attendee" ? t("attendeeHelp") : t("forgotPin")}</p>
    </form>
  );
}
