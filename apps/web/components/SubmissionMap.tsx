"use client";

import { useEffect, useMemo } from "react";
import {
  Map,
  Marker,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from "@vis.gl/react-google-maps";
import { useTranslation } from "react-i18next";
import { GRADE_COLORS, type Grade } from "@kaldirim/shared-types";
import type { Submission } from "@/lib/demo-submissions";
import { computeStreetAggregates } from "@/lib/demo-submissions";

const ISTANBUL = { lat: 41.0082, lng: 28.9784 };

function pinSvg(color: string, label?: string, size = 28): string {
  const h = Math.round(size * 1.33);
  const text = label
    ? `<text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="700" font-family="system-ui,sans-serif">${label}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 24 32">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>
    ${text}
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function circleSvg(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="20" fill="${color}" stroke="white" stroke-width="3"/>
    <text x="22" y="27" text-anchor="middle" fill="white" font-size="14" font-weight="700" font-family="system-ui,sans-serif">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function FitBounds({ submissions }: { submissions: Submission[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || submissions.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    submissions.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 56);
      const listener = google.maps.event.addListenerOnce(map, "idle", () => {
        const z = map.getZoom();
        if (typeof z === "number" && z > 16) map.setZoom(16);
      });
      return () => listener.remove();
    }
  }, [map, submissions]);

  return null;
}

function Legend() {
  const { t } = useTranslation();
  const grades: Grade[] = ["A", "B", "C", "D", "E", "F"];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[220px] rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
      <div className="mb-1.5 font-medium text-slate-700">{t("map.legendGrades")}</div>
      <div className="flex flex-wrap gap-1.5">
        {grades.map((g) => (
          <span
            key={g}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: GRADE_COLORS[g] }}
          >
            {g}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">{t("map.aggregateHint")}</p>
    </div>
  );
}

function MapFallback({ variant }: { variant: "missing-key" | "auth" }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 rounded-xl2 border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-medium text-slate-700">{t("map.unavailable")}</p>
      <p className="max-w-[42ch] text-xs text-slate-500">
        {variant === "auth" ? t("map.unavailableAuth") : t("map.unavailableKey")}
      </p>
    </div>
  );
}

function GoogleSubmissionMap({
  submissions,
  selectedId,
  onSelect,
  showAggregates,
}: {
  submissions: Submission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showAggregates: boolean;
}) {
  const status = useApiLoadingStatus();
  const aggregates = useMemo(() => computeStreetAggregates(submissions), [submissions]);
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
        <FitBounds submissions={submissions} />
        {submissions.map((s) => {
          const color = GRADE_COLORS[s.grade as Grade] ?? "#475569";
          const selected = s.id === selectedId;
          return (
            <Marker
              key={s.id}
              position={{ lat: s.lat, lng: s.lng }}
              title={s.street}
              onClick={() => onSelect(s.id)}
              zIndex={selected ? 100 : 10}
              icon={{
                url: pinSvg(color, undefined, selected ? 34 : 26),
                scaledSize: new google.maps.Size(selected ? 34 : 26, selected ? 45 : 35),
                anchor: new google.maps.Point(selected ? 17 : 13, selected ? 45 : 35),
              }}
            />
          );
        })}
        {showAggregates &&
          aggregates.map((a) => (
            <Marker
              key={`agg-${a.street}`}
              position={{ lat: a.lat, lng: a.lng }}
              title={`${a.street} (${a.avgScore.toFixed(1)})`}
              zIndex={5}
              icon={{
                url: circleSvg(GRADE_COLORS[a.grade], String(Math.round(a.avgScore))),
                scaledSize: new google.maps.Size(44, 44),
                anchor: new google.maps.Point(22, 22),
              }}
            />
          ))}
      </Map>
      <Legend />
    </div>
  );
}

export function SubmissionMap({
  submissions,
  selectedId,
  onSelect,
  mapsEnabled,
  showAggregates,
}: {
  submissions: Submission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  mapsEnabled: boolean;
  showAggregates: boolean;
}) {
  if (!mapsEnabled) return <MapFallback variant="missing-key" />;
  return (
    <GoogleSubmissionMap
      submissions={submissions}
      selectedId={selectedId}
      onSelect={onSelect}
      showAggregates={showAggregates}
    />
  );
}
