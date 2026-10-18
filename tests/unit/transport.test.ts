import { describe, expect, it } from "vitest";
import { STATUS_KIND, locationFreshness } from "@/lib/transport/status";

describe("locationFreshness", () => {
  const now = Date.parse("2026-10-18T10:00:00Z");
  it("is 'none' without a reading", () => {
    expect(locationFreshness(null, 120, now)).toBe("none");
    expect(locationFreshness(undefined, 120, now)).toBe("none");
  });
  it("is 'live' within the threshold and 'stale' after it", () => {
    expect(locationFreshness(new Date(now - 119_000), 120, now)).toBe("live");
    expect(locationFreshness(new Date(now - 120_000), 120, now)).toBe("live");
    expect(locationFreshness(new Date(now - 121_000), 120, now)).toBe("stale");
  });
});

describe("STATUS_KIND", () => {
  it("groups every status as boarding, moving or arrived", () => {
    expect(STATUS_KIND).toEqual({
      BOARDING: "boarding",
      TO_HOTEL: "moving",
      TO_STOP: "moving",
      AT_HOTEL: "arrived",
      AT_STOP: "arrived",
    });
  });
});
