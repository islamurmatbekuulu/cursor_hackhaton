"use client";

import { useTranslation } from "react-i18next";
import { GRADE_COLORS, type Grade } from "@kaldirim/shared-types";
import type { Submission } from "@/lib/demo-submissions";

interface Props {
  submissions: Submission[];
  selectedId: string | null;
  latestId: string | null;
  onSelect: (id: string) => void;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SubmissionList({ submissions, selectedId, latestId, onSelect }: Props) {
  const { t } = useTranslation();

  if (submissions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-center">
        <svg
          viewBox="0 0 48 48"
          className="mx-auto h-12 w-12 text-slate-400"
          role="img"
          aria-label={t("list.emptyTitle")}
        >
          <rect x="10" y="8" width="28" height="32" rx="6" fill="currentColor" opacity="0.16" />
          <path d="M17 18h14M17 24h10M17 30h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="mt-4 text-sm font-semibold text-slate-800">{t("list.emptyTitle")}</p>
        <p className="mx-auto mt-1 max-w-[34ch] text-sm leading-6 text-slate-500">{t("list.emptyBody")}</p>
      </div>
    );
  }

  return (
    <ul
      className="max-h-[310px] space-y-2 overflow-y-auto pr-1 md:max-h-[330px]"
      role="list"
      aria-label={t("list.heading")}
    >
      {submissions.map((s) => {
        const active = s.id === selectedId;
        const isLatest = s.id === latestId;
        const gradeColor = GRADE_COLORS[s.grade as Grade] ?? "#475569";
        const detectionCount = s.counts.reduce((sum, c) => sum + c.count, 0);
        const submittedAt = formatDate(s.submitted_at);
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              aria-label={`${isLatest ? `${t("list.latestBadge")}: ` : ""}${t("list.openDetail")}: ${s.street}, ${t("list.gradeLabel")} ${s.grade}, ${t("list.scoreLabel")} ${s.score.toFixed(1)}`}
              onClick={() => onSelect(s.id)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                isLatest
                  ? "border-accent bg-accent-soft/45 shadow-[0_14px_34px_-26px_rgba(13,148,136,0.85)]"
                  : active
                    ? "border-accent bg-accent-soft/30 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {isLatest && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-teal-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                    {t("list.latestBadge")}
                  </span>
                  <span className="text-xs font-semibold text-teal-950">{t("list.latestKicker")}</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-5 text-slate-950">{s.street}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">{s.district}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{submittedAt || t("list.datePending")}</span>
                    <span className="tnum">{detectionCount} {t("list.detections")}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 text-xs font-semibold text-slate-800">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: gradeColor }}
                      aria-hidden
                    >
                      {s.grade}
                    </span>
                    {t("list.gradeLabel")} {s.grade}
                  </span>
                  <span className="tnum text-xs font-semibold text-slate-700">
                    {t("list.scoreLabel")} {s.score.toFixed(1)}
                  </span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
