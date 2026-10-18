import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

const base = { APP_URL: "http://localhost:3000", DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("parseEnv", () => {
  it("accepts a minimal development config", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development" }).OTP_PROVIDER).toBe("dev");
  });

  it("refuses the dev OTP provider in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", OTP_PROVIDER: "dev" })).toThrow(/OTP_PROVIDER/);
  });

  it("requires Twilio credentials when Twilio is selected", () => {
    expect(() => parseEnv({ ...base, OTP_PROVIDER: "twilio" })).toThrow(/TWILIO_AUTH_TOKEN/);
  });

  it("names missing variables without echoing values", () => {
    try {
      parseEnv({ DATABASE_URL: "mysql://secret-value" });
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/APP_URL/);
      expect(message).not.toMatch(/secret-value/);
    }
  });
});
