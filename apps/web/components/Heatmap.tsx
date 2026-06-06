"use client";

import { useEffect, useMemo } from "react";
import {
  Map,
  Marker,
  useMap,
  useMapsLibrary,
  useApiLoadingStatus,
  APILoadingStatus,
} from "@vis.gl/react-google-maps";
import { useTranslation } from "react-i18next";
import type { ScoreResponse } from "@kaldirim/shared-types";

const ISTANBUL = { lat: 41.0082, lng: 28.9784 };

type WeightedPoint = { lat: number; lng: number; weight: number };

// @types/google.maps stubs the (deprecated-but-functional) visualization
// HeatmapLayer down to `constructor()` with no methods. The runtime still
// accepts options + setMap, so bridge it with a minimal constructor type.
type WeightedLocation = { location: google.maps.LatLng; weight: number };
type HeatmapLayerInstance = { setMap(map: google.maps.Map | null): void };
type HeatmapLayerCtor = new (opts: {
  data: WeightedLocation[];
  radius?: number;
  opacity?: number;
  gradient?: string[];
  dissipating?: boolean;
  maxIntensity?: number;
  map?: google.maps.Map | null;
}) => HeatmapLayerInstance;

function toPoints(result: ScoreResponse | null): WeightedPoint[] {
  if (!result) return [];
  return result.points
    .filter((p) => p.point.lat !== 0 || p.point.lng !== 0)
    .map((p) => ({ lat: p.point.lat, lng: p.point.lng, weight: Math.max(0.15, p.weight) }));
}

// Weighted heatmap layer + viewport fit. Must be a child of <Map> so useMap()
// resolves the parent map instance from context.
function HeatLayer({ points }: { points: WeightedPoint[] }) {
  const map = useMap();
  const visualization = useMapsLibrary("visualization");

  useEffect(() => {
    if (!map || !visualization || points.length === 0) return;

    const data = points.map((p) => ({
      location: new google.maps.LatLng(p.lat, p.lng),
      weight: p.weight,
    }));

    const HeatmapLayer = visualization.HeatmapLayer as unknown as HeatmapLayerCtor;
    const layer = new HeatmapLayer({
      data,
      radius: 28,
      opacity: 0.75,
      gradient: [
        "rgba(22,163,74,0)",
        "rgba(22,163,74,0.85)",
        "#16a34a",
        "#ca8a04",
        "#dc2626",
      ],
      map,
    });

    const bounds = new google.maps.LatLngBounds();
    data.forEach((d) => bounds.extend(d.location));
    let idleListener: google.maps.MapsEventListener | undefined;
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
      // Avoid zooming in too tight on a single cluster (preserves the city feel).
      idleListener = google.maps.event.addListenerOnce(map, "idle", () => {
        const z = map.getZoom();
        if (typeof z === "number" && z > 17) map.setZoom(17);
      });
    }

    return () => {
      layer.setMap(null);
      idleListener?.remove();
    };
  }, [map, visualization, points]);

  return null;
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-white/90 px-3 py-2 text-xs shadow">
      <div className="mb-1 font-medium text-slate-700">{t("map.legend")}</div>
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{t("map.low")}</span>
        <span className="h-2 w-24 rounded-full bg-gradient-to-r from-green-600 via-yellow-500 to-red-600" />
        <span className="text-slate-500">{t("map.high")}</span>
      </div>
    </div>
  );
}

function MapFallback({ variant }: { variant: "missing-key" | "auth" }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 rounded-xl2 border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-8 w-8 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
        <path d="M9 3v15M15 6v15" />
      </svg>
      <p className="text-sm font-medium text-slate-700">{t("map.unavailable")}</p>
      <p className="max-w-[42ch] text-xs text-slate-500">
        {variant === "auth" ? t("map.unavailableAuth") : t("map.unavailableKey")}
      </p>
    </div>
  );
}

// Rendered only when an API key is present (i.e. inside <APIProvider>), so the
// Google Maps hooks always have a valid context.
function GoogleHeatmap({ result }: { result: ScoreResponse | null }) {
  const status = useApiLoadingStatus();
  const points = useMemo(() => toPoints(result), [result]);
  const failed =
    status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED;

  if (failed) return <MapFallback variant="auth" />;

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-xl2 border border-slate-200 shadow-diffuse">
      <Map
        defaultCenter={ISTANBUL}
        defaultZoom={12}
        gestureHandling="greedy"
        clickableIcons={false}
        className="h-full w-full"
      >
        <HeatLayer points={points} />
        {points.map((p, i) => (
          <Marker key={`${p.lat},${p.lng},${i}`} position={{ lat: p.lat, lng: p.lng }} />
        ))}
      </Map>
      <Legend />
    </div>
  );
}

export function Heatmap({
  result,
  mapsEnabled,
}: {
  result: ScoreResponse | null;
  mapsEnabled: boolean;
}) {
  if (!mapsEnabled) return <MapFallback variant="missing-key" />;
  return <GoogleHeatmap result={result} />;
}
