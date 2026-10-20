import { afterEach, describe, expect, it, vi } from "vitest";

// `mapsApiKey`/`mapId` are computed once from `process.env` at module load, so
// each case stubs the env and re-imports the module fresh.
async function loadConfig(env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string; NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?: string }) {
  vi.resetModules();
  // Empty string mirrors the real ".env with blank values" case (dotenv sets the key present but empty).
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "");
  return import("@/lib/maps/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("mapsApiKey", () => {
  it("is undefined when the variable is unset (no embedded map; link fallback only)", async () => {
    const { mapsApiKey } = await loadConfig({});
    expect(mapsApiKey).toBeUndefined();
  });

  it("is undefined for the .env.example placeholder, so a fresh clone without setup never attempts to load Maps", async () => {
    const { mapsApiKey } = await loadConfig({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "<your key>" });
    expect(mapsApiKey).toBeUndefined();
  });

  it("is the configured value otherwise", async () => {
    const { mapsApiKey } = await loadConfig({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test-key-123" });
    expect(mapsApiKey).toBe("test-key-123");
  });
});

describe("mapId", () => {
  it("falls back to Google's DEMO_MAP_ID when unset", async () => {
    const { mapId } = await loadConfig({});
    expect(mapId).toBe("DEMO_MAP_ID");
  });

  it("falls back to DEMO_MAP_ID for the placeholder value too", async () => {
    const { mapId } = await loadConfig({ NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "<your map id>" });
    expect(mapId).toBe("DEMO_MAP_ID");
  });

  it("is the configured value otherwise", async () => {
    const { mapId } = await loadConfig({ NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "abc123" });
    expect(mapId).toBe("abc123");
  });
});
