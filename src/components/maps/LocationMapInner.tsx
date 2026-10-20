"use client";

import { useEffect, useRef } from "react";
import { APILoadingStatus, APIProvider, AdvancedMarker, Map, Pin, useApiLoadingStatus, useMap } from "@vis.gl/react-google-maps";
import { useLocale } from "next-intl";
import { mapId, type MapPoint } from "@/lib/maps/config";
import type { LocationMapProps } from "./LocationMap";

const PIN_STYLE: Record<MapPoint["kind"], { background: string; borderColor: string; glyphColor: string }> = {
  hotel: { background: "#1d4ed8", borderColor: "#1e3a8a", glyphColor: "#ffffff" },
  stop: { background: "#374151", borderColor: "#111827", glyphColor: "#ffffff" },
  bus: { background: "#15803d", borderColor: "#14532d", glyphColor: "#ffffff" },
  // Stale positions are grey so they never look like a live location.
  busStale: { background: "#9ca3af", borderColor: "#4b5563", glyphColor: "#111827" },
};

/** The live bus marker's point id (see LiveBusDetail) — the one point `useRecenterOnFirstFix` watches for. */
const BUS_POINT_ID = "bus";

function boundsOf(points: MapPoint[]): google.maps.LatLngBoundsLiteral {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) };
}

/** Initial camera: one point centers on it; several points fit them all, with padding. */
export function view(points: MapPoint[]) {
  if (points.length === 1) return { defaultCenter: { lat: points[0].lat, lng: points[0].lng }, defaultZoom: 15 };
  return { defaultBounds: { ...boundsOf(points), padding: 48 } };
}

/**
 * `defaultCenter`/`defaultBounds` on <Map> are only applied once, when the map
 * is created — so if the page loads before the bus has a GPS fix yet, the map
 * never moves to it once polling delivers the first one. This re-centers the
 * map exactly once, the first time `BUS_POINT_ID` appears in `points`; every
 * later update only moves the marker (see <AdvancedMarker position>) and never
 * fights the viewer's own pan/zoom.
 */
function useRecenterOnFirstFix(points: MapPoint[]) {
  const map = useMap();
  const seenRef = useRef(points.some((p) => p.id === BUS_POINT_ID));
  useEffect(() => {
    if (!map || seenRef.current) return;
    const bus = points.find((p) => p.id === BUS_POINT_ID);
    if (!bus) return;
    seenRef.current = true;
    if (points.length > 1) {
      map.fitBounds(boundsOf(points), 48);
    } else {
      map.setCenter({ lat: bus.lat, lng: bus.lng });
      map.setZoom(15);
    }
  }, [map, points]);
}

function MapBody({ points, label, fallback, loadingText, failedText }: LocationMapProps) {
  const status = useApiLoadingStatus();
  useRecenterOnFirstFix(points);
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="flex flex-col gap-2">
        <p role="status" className="text-muted">
          {failedText}
        </p>
        {fallback}
      </div>
    );
  }
  return (
    <div role="region" aria-label={label} className="relative h-72 w-full overflow-hidden rounded-lg border border-line">
      {status !== APILoadingStatus.LOADED && (
        <p className="absolute inset-0 flex items-center justify-center text-muted">{loadingText}</p>
      )}
      <Map mapId={mapId} gestureHandling="cooperative" clickableIcons={false} streetViewControl={false} {...view(points)}>
        {points.map((p) => (
          <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.title}>
            <Pin {...PIN_STYLE[p.kind]} glyph={p.glyph} />
          </AdvancedMarker>
        ))}
      </Map>
    </div>
  );
}

export default function LocationMapInner(props: LocationMapProps & { apiKey: string }) {
  const locale = useLocale();
  const { apiKey, ...rest } = props;
  return (
    <APIProvider apiKey={apiKey} language={locale} region="IN">
      <MapBody {...rest} />
    </APIProvider>
  );
}
