"use client";

import { useTranslation } from "react-i18next";
import {
  CLASS_LABELS_TR,
  GRADE_COLORS,
  type ScoreResponse,
} from "@kaldirim/shared-types";

function labelFor(cls: string): string {
  return CLASS_LABELS_TR[cls] ?? cls;
}

export function ScoreCard({ result }: { result: ScoreResponse }) {
  const { t } = useTranslation();
  const gradeColor = GRADE_COLORS[result.grade] ?? "#475569";

  return (
    <section
      aria-label={t("score.title")}
      className="rounded-xl2 border border-slate-200 bg-white p-6 shadow-diffuse"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {t("score.title")}
          </h2>
          <p className="mt-1 truncate text-lg font-semibold text-slate-900">
            {result.query}
          </p>
        </div>
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold text-white"
          style={{ backgroundColor: gradeColor }}
          aria-label={`${t("score.grade")}: ${result.grade}`}
        >
          {result.grade}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-center">
        <Metric label={t("score.title")} value={result.score.toFixed(1)} />
        <Metric label={t("score.pollution")} value={result.pollution_raw.toFixed(2)} />
        <Metric label={t("score.points")} value={String(result.points_sampled)} />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-slate-700">{t("score.classes")}</h3>
        {result.counts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("score.noDetections")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {result.counts.map((c) => (
              <li
                key={c.class}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm"
              >
                <span className="font-medium text-slate-800">{labelFor(c.class)}</span>
                <span className="tnum text-slate-500">×{c.count}</span>
                <span className="tnum text-xs text-slate-400">
                  {(c.avg_confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.panorama_dates && result.panorama_dates.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          {t("score.panoDate")}: {result.panorama_dates.join(", ")}
        </p>
      )}

      {result.limitations && result.limitations.length > 0 && (
        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer font-medium">{t("score.limitations")}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-2 py-3">
      <div className="tnum text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
