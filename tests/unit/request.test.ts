import { beforeAll, describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/api/request";

const req = (headers: Record<string, string>) => new Request("http://x/api", { method: "POST", headers });

describe("isSameOrigin", () => {
  beforeAll(() => {
    process.env.APP_URL = "https://events.example.org";
  });
  it("accepts the request's own host, e.g. a preview deployment", () => {
    expect(isSameOrigin(req({ origin: "https://app-git-x.vercel.app", host: "app-git-x.vercel.app" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://a.vercel.app", "x-forwarded-host": "a.vercel.app", host: "internal" }))).toBe(true);
  });
  it("accepts APP_URL", () => {
    expect(isSameOrigin(req({ origin: "https://events.example.org", host: "internal:3000" }))).toBe(true);
  });
  it("rejects other sites and malformed origins", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "events.example.org" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "null", host: "events.example.org" }))).toBe(false);
  });
  it("falls back to Fetch Metadata without an Origin header", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(req({}))).toBe(false);
  });
});
