import type { OtpCheckResult, OtpProvider, OtpSendResult } from "./types";

// Twilio Verify via its REST API (no SDK dependency).
// Docs: https://www.twilio.com/docs/verify/api
type TwilioConfig = { accountSid: string; authToken: string; serviceSid: string };

const TIMEOUT_MS = 8000;

export function createTwilioOtpProvider(config: TwilioConfig): OtpProvider {
  const base = `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}`;
  const authHeader = "Basic " + Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  async function post(path: string, body: Record<string, string>) {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  }

  return {
    name: "twilio",

    async send(phone): Promise<OtpSendResult> {
      try {
        const res = await post("/Verifications", { To: phone, Channel: "sms" });
        if (res.ok) return { ok: true };
        if (res.status === 429) return { ok: false, reason: "rate_limited" };
        console.error(`[otp:twilio] send failed with HTTP ${res.status}`);
        return { ok: false, reason: "unavailable" };
      } catch (err) {
        console.error("[otp:twilio] send error", (err as Error).name);
        return { ok: false, reason: "unavailable" };
      }
    },

    async check(phone, code): Promise<OtpCheckResult> {
      try {
        const res = await post("/VerificationCheck", { To: phone, Code: code });
        // 404: no pending verification (expired, already used, or too many attempts).
        if (res.status === 404) return { ok: false, reason: "expired" };
        if (res.status === 429) return { ok: false, reason: "rate_limited" };
        if (!res.ok) {
          console.error(`[otp:twilio] check failed with HTTP ${res.status}`);
          return { ok: false, reason: "unavailable" };
        }
        const data = (await res.json()) as { status?: string };
        return data.status === "approved" ? { ok: true } : { ok: false, reason: "invalid" };
      } catch (err) {
        console.error("[otp:twilio] check error", (err as Error).name);
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}
