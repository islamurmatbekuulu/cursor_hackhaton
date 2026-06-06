"use client";

import { useEffect, useRef, useState } from "react";
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setImageError(false);
  }, [submission?.id]);

  useEffect(() => {
    if (!submission) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previousFocusRef.current?.focus();
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
      <div
        className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-detail-title"
        aria-describedby="report-detail-description"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              {t("detail.reviewStatus")}
            </p>
            <h2 id="report-detail-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              {t("detail.title")}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 active:scale-[0.96]"
            aria-label={t("detail.close")}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <figure>
            {showLiveImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={liveImageUrl}
                alt={t("detail.photoAlt")}
                className="aspect-[4/3] w-full rounded-2xl border border-slate-200 object-cover"
                loading="lazy"
                onError={() => setImageError(true)}
              />
            ) : (
              <PhotoPlaceholder street={submission.street} hue={submission.placeholder_hue} className="aspect-[4/3]" />
            )}
            <figcaption
              id="report-detail-description"
              className="mt-2 rounded-xl border border-accent-soft bg-accent-soft/40 px-3 py-2 text-xs leading-5 text-teal-950"
            >
              {t("detail.anonymizedOnly")}: {t("detail.photoCaption")}
            </figcaption>
          </figure>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-tight text-slate-950">{submission.street}</p>
              <p className="mt-1 text-sm font-medium text-slate-600">{submission.district}</p>
              <p className="mt-2 text-sm text-slate-500">
                {t("detail.gradeSentence", {
                  grade: submission.grade,
                  score: submission.score.toFixed(1),
                })}
              </p>
            </div>
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
              style={{ backgroundColor: gradeColor }}
              aria-label={t("detail.gradeSentence", {
                grade: submission.grade,
                score: submission.score.toFixed(1),
              })}
            >
              {submission.grade}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 text-center">
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
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{t("detail.classes")}</h3>
            {submission.counts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
                {t("detail.noDetections")}
              </p>
            ) : (
              <ul className="space-y-2">
                {submission.counts.map((c) => (
                  <li
                    key={c.class}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold text-slate-900">{labelFor(c.class)}</span>
                        <span className="tnum ml-2 text-slate-500">x{c.count}</span>
                      </div>
                      <span className="tnum text-xs font-semibold text-slate-600">
                        {t("detail.contribution")} {c.contribution.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{t("detail.confidence")}</span>
                      <span className="tnum font-medium text-slate-700">
                        {Math.round(c.avg_confidence * 100)}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {submission.limitations.length > 0 && (
            <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <summary className="min-h-[44px] cursor-pointer font-semibold text-slate-800">
                {t("detail.limitations")}
              </summary>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
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
    <div className="bg-white px-2 py-4">
      <div className="tnum text-2xl font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tnum text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
