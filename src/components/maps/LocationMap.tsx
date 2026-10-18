"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { mapsApiKey, type MapPoint } from "@/lib/maps/config";

export type LocationMapProps = {
  points: MapPoint[];
  /** Accessible description of what the map shows. */
  label: string;
  /** Shown instead of the map when Maps isn't configured or fails to load. */
  fallback: ReactNode;
  loadingText: string;
  failedText: string;
};

// The Maps JavaScript API is loaded only on pages that render a map, and only
// in the browser.
const Inner = dynamic(() => import("./LocationMapInner"), {
  ssr: false,
  loading: () => null,
});

export function LocationMap(props: LocationMapProps) {
  if (!mapsApiKey || props.points.length === 0) return <>{props.fallback}</>;
  return <Inner {...props} apiKey={mapsApiKey} />;
}
