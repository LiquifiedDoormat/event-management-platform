// Browser-side Google Maps settings. NEXT_PUBLIC_* values are inlined at build
// time, so they must be referenced literally. Placeholder values copied from
// .env.example ("<...>") count as "not configured".
const clean = (v: string | undefined) => (v && !v.startsWith("<") ? v : undefined);

export const mapsApiKey = clean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

/** Advanced markers need a Map ID; Google's DEMO_MAP_ID works for development. */
export const mapId = clean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID) ?? "DEMO_MAP_ID";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  kind: "hotel" | "stop" | "bus" | "busStale";
  /** Short text inside the pin, e.g. a stop number. */
  glyph?: string;
  title: string;
};
