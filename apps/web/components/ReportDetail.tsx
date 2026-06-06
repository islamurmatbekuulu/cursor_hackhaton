"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CLASS_LABELS_TR,
  GRADE_COLORS,
  type Grade,
} from "@kaldirim/shared-types";
import type { Submission } from "@/lib/demo-submissions";
import { PhotoPlaceholder } from "@/components/PhotoPlaceholder";
import { USE_DEMO_DATA, submissionImageUrl } from "@/lib/submissions";

interface Props {
  submission: Submission | null;
  onClose: () => void;
}

function labelFor(cls: string): string {
  return CLASS_LABELS_TR[cls] ?? cls;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ReportDetail({ submission, onClose }: Props) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [submission?.id]);

  useEffect(() => {
    if (!submission) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submission, onClose]);

  if (!submission) return null;

  const gradeColor = GRADE_COLORS[submission.grade as Grade] ?? "#475569";
  const liveImageUrl = !USE_DEMO_DATA ? submissionImageUrl(submission.id) : "";
  const showLiveImage = liveImageUrl && !imageError;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label={t("detail.close")}
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-detail-title"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="report-detail-title" className="text-base font-semibold text-slate-900">
            {t("detail.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label={t("detail.close")}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {showLiveImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={liveImageUrl}
              alt={t("detail.photoAlt")}
              className="w-full rounded-xl border border-slate-200 object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <PhotoPlaceholder street={submission.street} hue={submission.placeholder_hue} />
          )}

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900">{submission.street}</p>
              <p className="text-sm text-slate-500">{submission.district}</p>
            </div>
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
              style={{ backgroundColor: gradeColor }}
            >
              {submission.grade}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-center">
            <Metric label={t("detail.score")} value={submission.score.toFixed(1)} />
            <Metric label={t("detail.pollution")} value={submission.pollution_raw.toFixed(2)} />
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label={t("detail.date")} value={formatDate(submission.submitted_at)} />
            <Row
              label={t("detail.coords")}
              value={`${submission.lat.toFixed(5)}, ${submission.lng.toFixed(5)}`}
            />
          </dl>

          <div className="mt-5">
            <h3 className="mb-2 text-sm font-medium text-slate-700">{t("detail.classes")}</h3>
            {submission.counts.length === 0 ? (
              <p className="text-sm text-slate-500">{t("detail.noDetections")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {submission.counts.map((c) => (
                  <li
                    key={c.class}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm"
                  >
                    <span className="font-medium text-slate-800">{labelFor(c.class)}</span>
                    <span className="tnum text-slate-500">×{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {submission.limitations.length > 0 && (
            <details className="mt-5 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-600">
                {t("detail.limitations")}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {submission.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-2 py-3">
      <div className="tnum text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tnum text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
