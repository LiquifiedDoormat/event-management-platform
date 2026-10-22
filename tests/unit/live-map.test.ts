import { describe, expect, it } from "vitest";
import { merge } from "@/hooks/useBusLive";
import { view } from "@/components/maps/LocationMapInner";
import type { MapPoint } from "@/lib/maps/config";
import type { BusLiveSnapshot } from "@/lib/realtime/types";

const trip = (overrides: Partial<NonNullable<BusLiveSnapshot["trip"]>> = {}) => ({
  status: "DEPARTED_VENUE" as const,
  statusChangedAt: "2026-10-20T10:00:00.000Z",
  sharingLocation: true,
  isDelayed: false,
  ...overrides,
});

const location = (recordedAt: string) => ({ latitude: 12.97, longitude: 77.59, accuracy: 10, recordedAt });

const snapshot = (overrides: Partial<BusLiveSnapshot> = {}): BusLiveSnapshot => ({
  busId: "bus-1",
  trip: trip(),
  location: null,
  ...overrides,
});

describe("merge (useBusLive)", () => {
  it("takes the incoming snapshot when it has no location yet to compare against", () => {
    const current = snapshot();
    const incoming = snapshot({ location: location("2026-10-20T10:00:05.000Z") });
    expect(merge(current, incoming)).toBe(incoming);
  });

  it("takes a newer incoming location, moving the marker forward", () => {
    const current = snapshot({ location: location("2026-10-20T10:00:00.000Z") });
    const incoming = snapshot({ location: location("2026-10-20T10:00:20.000Z") });
    expect(merge(current, incoming)).toBe(incoming);
  });

  it("keeps the current (newer) location if a late poll delivers an older reading for the same trip", () => {
    const current = snapshot({ location: location("2026-10-20T10:00:20.000Z") });
    const stale = snapshot({ location: location("2026-10-20T10:00:05.000Z") });
    const result = merge(current, stale);
    expect(result.location).toBe(current.location);
    // Everything else (status, mode) still comes from the fresh poll.
    expect(result).not.toBe(current);
  });

  it("does not compare stale ordering across different trips (e.g. a new trip started)", () => {
    const current = snapshot({ trip: null, location: location("2026-10-20T10:00:20.000Z") });
    const incoming = snapshot({ trip: trip(), location: location("2026-10-20T09:00:00.000Z") });
    // current.trip is null, so the "same trip" guard doesn't apply: the new trip's reading wins.
    expect(merge(current, incoming)).toBe(incoming);
  });

  it("clears the bus marker when a trip ends and its location is removed", () => {
    const current = snapshot({ location: location("2026-10-20T10:00:20.000Z") });
    const ended = snapshot({ trip: null, location: null });
    expect(merge(current, ended)).toBe(ended);
  });
});

describe("view (LocationMapInner initial camera)", () => {
  const point = (id: string, lat: number, lng: number): MapPoint => ({ id, lat, lng, kind: "hotel", title: id });

  it("centers directly on a single point", () => {
    expect(view([point("hotel", 12.97, 77.59)])).toEqual({ defaultCenter: { lat: 12.97, lng: 77.59 }, defaultZoom: 15 });
  });

  it("fits bounds around several points, with padding", () => {
    const result = view([point("hotel", 12.9, 77.5), point("stop", 13.0, 77.6), point("bus", 12.95, 77.45)]);
    expect(result).toEqual({
      defaultBounds: { north: 13.0, south: 12.9, east: 77.6, west: 77.45, padding: 48 },
    });
  });
});
