"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { useTranslation } from "react-i18next";
import type { ScoreResponse } from "@kaldirim/shared-types";

const ISTANBUL: [number, number] = [41.0082, 28.9784];

function HeatLayer({ result }: { result: ScoreResponse }) {
  const map = useMap();

  const points = useMemo<[number, number, number][]>(
    () =>
      result.points
        .filter((p) => p.point.lat !== 0 || p.point.lng !== 0)
        .map((p) => [p.point.lat, p.point.lng, Math.max(0.15, p.weight)]),
    [result],
  );

  useEffect(() => {
    if (points.length === 0) return;
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 18,
      maxZoom: 17,
      gradient: { 0.2: "#16a34a", 0.5: "#ca8a04", 0.8: "#dc2626" },
    }).addTo(map);

    const bounds = L.latLngBounds(points.map((p) => [p[0], p[1]] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}

export function Heatmap({ result }: { result: ScoreResponse | null }) {
  const { t } = useTranslation();
  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-xl2 border border-slate-200 shadow-diffuse">
      <MapContainer center={ISTANBUL} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {result && <HeatLayer result={result} />}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-white/90 px-3 py-2 text-xs shadow">
        <div className="mb-1 font-medium text-slate-700">{t("map.legend")}</div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{t("map.low")}</span>
          <span className="h-2 w-24 rounded-full bg-gradient-to-r from-green-600 via-yellow-500 to-red-600" />
          <span className="text-slate-500">{t("map.high")}</span>
        </div>
      </div>
    </div>
  );
}
