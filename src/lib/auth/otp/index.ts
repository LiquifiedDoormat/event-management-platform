import "server-only";
import { env } from "@/config/env";
import { devOtpProvider } from "./dev";
import { createTwilioOtpProvider } from "./twilio";
import type { OtpProvider } from "./types";

let provider: OtpProvider | undefined;

export function otpProvider(): OtpProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.OTP_PROVIDER === "twilio"
      ? createTwilioOtpProvider({
          accountSid: e.TWILIO_ACCOUNT_SID!,
          authToken: e.TWILIO_AUTH_TOKEN!,
          serviceSid: e.TWILIO_VERIFY_SERVICE_SID!,
        })
      : devOtpProvider;
  return provider;
}

export type { OtpProvider } from "./types";
