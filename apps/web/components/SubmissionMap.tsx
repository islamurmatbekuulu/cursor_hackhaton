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
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
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
  const grades: Array<{ grade: Grade; range: string }> = [
    { grade: "A", range: "90+" },
    { grade: "B", range: "80-89" },
    { grade: "C", range: "70-79" },
    { grade: "D", range: "60-69" },
    { grade: "E", range: "50-59" },
    { grade: "F", range: "<50" },
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[260px] rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 text-xs shadow-diffuse backdrop-blur">
      <div className="mb-2 font-semibold text-slate-800">{t("map.legendGrades")}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {grades.map(({ grade, range }) => (
          <span
            key={grade}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: GRADE_COLORS[grade] }}
              aria-hidden
            />
            {t("map.gradePrefix")} {grade} · {range}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">{t("map.aggregateHint")}</p>
      <p className="mt-1 text-[10px] text-slate-500">{t("map.selectedHint")}</p>
    </div>
  );
}

function MapFallback({ variant }: { variant: "missing-key" | "auth" }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl2 border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <svg viewBox="0 0 48 48" className="h-12 w-12 text-slate-400" aria-hidden>
        <path d="M14 8 6 12v28l8-4 10 4 10-4 8 4V12l-8-4-10 4-10-4Z" fill="currentColor" opacity="0.16" />
        <path d="M14 8v28M24 12v28M34 8v28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-semibold text-slate-800">{t("map.unavailable")}</p>
      <p className="max-w-[42ch] text-sm leading-6 text-slate-500">
        {variant === "auth" ? t("map.unavailableAuth") : t("map.unavailableKey")}
      </p>
    </div>
  );
}

function EmptyMapOverlay() {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-diffuse backdrop-blur">
      <p className="text-sm font-semibold text-slate-800">{t("map.emptyTitle")}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{t("map.emptyBody")}</p>
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
  const { t } = useTranslation();
  const aggregates = useMemo(() => computeStreetAggregates(submissions), [submissions]);
  const failed =
    status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED;

  if (failed) return <MapFallback variant="auth" />;

  return (
    <div className="relative h-full min-h-[260px] overflow-hidden rounded-xl2 border border-slate-200 shadow-diffuse">
      <Map
        defaultCenter={ISTANBUL}
        defaultZoom={12}
        gestureHandling="cooperative"
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
              title={`${s.street} - ${t("map.gradePrefix")} ${s.grade}, skor ${s.score.toFixed(1)}`}
              onClick={() => onSelect(s.id)}
              zIndex={selected ? 100 : 10}
              icon={{
                url: pinSvg(color, s.grade, selected ? 34 : 28),
                scaledSize: new google.maps.Size(selected ? 34 : 28, selected ? 45 : 37),
                anchor: new google.maps.Point(selected ? 17 : 14, selected ? 45 : 37),
              }}
            />
          );
        })}
        {showAggregates &&
          aggregates.map((a) => (
            <Marker
              key={`agg-${a.street}`}
              position={{ lat: a.lat, lng: a.lng }}
              title={`${a.street} - ${t("map.gradePrefix")} ${a.grade}, ortalama ${a.avgScore.toFixed(1)}`}
              zIndex={5}
              icon={{
                url: circleSvg(GRADE_COLORS[a.grade], String(Math.round(a.avgScore))),
                scaledSize: new google.maps.Size(44, 44),
                anchor: new google.maps.Point(22, 22),
              }}
            />
          ))}
      </Map>
      {submissions.length === 0 && <EmptyMapOverlay />}
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
