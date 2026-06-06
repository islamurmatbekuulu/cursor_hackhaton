"use client";

import { useTranslation } from "react-i18next";
import { GRADE_COLORS, type Grade } from "@kaldirim/shared-types";
import type { Submission } from "@/lib/demo-submissions";

interface Props {
  submissions: Submission[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatDate(iso: string): string {
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

export function SubmissionList({ submissions, selectedId, onSelect }: Props) {
  const { t } = useTranslation();

  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-700">{t("list.emptyTitle")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("list.emptyBody")}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="listbox" aria-label={t("list.heading")}>
      {submissions.map((s) => {
        const active = s.id === selectedId;
        const gradeColor = GRADE_COLORS[s.grade as Grade] ?? "#475569";
        return (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(s.id)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                active
                  ? "border-accent bg-accent-soft/30 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{s.street}</p>
                  <p className="truncate text-xs text-slate-500">{s.district}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDate(s.submitted_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: gradeColor }}
                    aria-hidden
                  >
                    {s.grade}
                  </span>
                  <span className="tnum text-xs font-medium text-slate-600">{s.score.toFixed(1)}</span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
