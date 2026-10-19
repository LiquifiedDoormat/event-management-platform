import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

const base = { APP_URL: "http://localhost:3000", DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("parseEnv", () => {
  it("accepts a minimal development config", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development" }).APP_URL).toBe("http://localhost:3000");
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
