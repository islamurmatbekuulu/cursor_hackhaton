"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { streetAverageScore, type Submission } from "@/lib/demo-submissions";
import { fetchSubmissions, USE_DEMO_DATA } from "@/lib/submissions";
import { StreetFilter } from "@/components/StreetFilter";
import { SubmissionList } from "@/components/SubmissionList";
import { ReportDetail } from "@/components/ReportDetail";
import { AssistantChat } from "@/components/AssistantChat";

const SubmissionMap = dynamic(
  () => import("@/components/SubmissionMap").then((m) => m.SubmissionMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[260px] animate-pulse rounded-xl2 bg-slate-200" />
    ),
  },
);

interface Props {
  mapsEnabled: boolean;
}

export function SubmissionConsole({ mapsEnabled }: Props) {
  const { t } = useTranslation();
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (street: string | null) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSubmissions(street);
      setAllSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAllSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(selectedStreet);
  }, [load, selectedStreet]);

  const filtered = allSubmissions;
  const latestSubmission = filtered[0] ?? null;
  const avg = useMemo(() => streetAverageScore(filtered), [filtered]);
  const selected = filtered.find((s) => s.id === selectedId) ?? null;
  const summary = useMemo(() => {
    const streetCount = new Set(filtered.map((s) => `${s.district}:${s.street}`)).size;
    const priorityCount = filtered.filter(
      (s) => s.score < 60 || s.grade === "E" || s.grade === "F",
    ).length;
    return { streetCount, priorityCount };
  }, [filtered]);

  useEffect(() => {
    if (selectedStreet || filtered.length === 0) return;
    setSelectedId((current) => {
      if (current && filtered.some((s) => s.id === current)) return current;
      return filtered[0].id;
    });
  }, [filtered, selectedStreet]);

  function handleStreetChange(street: string | null) {
    setSelectedStreet(street);
    setSelectedId(null);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  return (
    <>
      <section
        id="console-workbench"
        aria-labelledby="console-workbench-title"
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <section
            aria-labelledby="console-workbench-title"
            className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-diffuse md:p-5"
          >
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t("console.reportsHeading")}
              </p>
              <h2 id="console-workbench-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                {t("console.workbench")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t("console.workbenchBody")}</p>
            </div>
            <ModeNotice />
            <StreetFilter
              selectedStreet={selectedStreet}
              onStreetChange={handleStreetChange}
              mapsEnabled={mapsEnabled}
              streetAverage={avg}
              reportCount={filtered.length}
            />
          </section>

          <section aria-label="Özet metrikler" className="grid grid-cols-2 gap-3">
            <SummaryCard
              label={t("summary.avgScore")}
              value={avg != null ? avg.toFixed(1) : "—"}
              helper={selectedStreet ? t("summary.filtered") : t("summary.citywide")}
            />
            <SummaryCard
              label={t("summary.totalReports")}
              value={String(filtered.length)}
              helper={t("console.reportsHeading")}
            />
            <SummaryCard
              label={t("summary.priorityReports")}
              value={String(summary.priorityCount)}
              helper={t("summary.priorityHint")}
              tone={summary.priorityCount > 0 ? "warning" : "neutral"}
            />
            <SummaryCard
              label={t("summary.streetCount")}
              value={String(summary.streetCount)}
              helper={selectedStreet ? t("console.selectedStreet") : t("summary.citywide")}
            />
            <p className="col-span-2 rounded-2xl border border-accent-soft bg-accent-soft/45 px-4 py-3 text-sm leading-6 text-teal-950">
              {t("kvkk.note")}
            </p>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
          <section
            aria-labelledby="report-list-title"
            className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-diffuse lg:h-[420px] lg:overflow-hidden"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="report-list-title" className="text-base font-semibold text-slate-950">
                  {t("list.heading")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{t("list.description")}</p>
              </div>
              <span className="tnum rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {filtered.length}
              </span>
            </div>
            {loading ? (
              <LoadingList />
            ) : error ? (
              <ErrorPanel message={error} onRetry={() => void load(selectedStreet)} />
            ) : (
              <SubmissionList
                submissions={filtered}
                selectedId={selectedId}
                latestId={latestSubmission?.id ?? null}
                onSelect={handleSelect}
              />
            )}
          </section>

          <section
            aria-labelledby="map-panel-title"
            className="flex h-[340px] flex-col rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-diffuse sm:h-[380px] lg:h-[420px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2 pt-1">
              <div>
                <h2 id="map-panel-title" className="text-base font-semibold text-slate-950">
                  {t("map.heading")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{t("map.selectedHint")}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {selectedStreet ?? t("filter.allStreets")}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <SubmissionMap
                submissions={filtered}
                selectedId={selectedId}
                onSelect={handleSelect}
                mapsEnabled={mapsEnabled}
                showAggregates={!selectedStreet}
              />
            </div>
          </section>
        </div>
      </section>

      <ReportDetail submission={selected} onClose={() => setSelectedId(null)} />
      <AssistantChat />
    </>
  );
}

function ModeNotice() {
  const { t } = useTranslation();
  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${
        USE_DEMO_DATA
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-accent-soft bg-accent-soft/45 text-teal-950"
      }`}
      role="status"
    >
      <p className="font-semibold">{USE_DEMO_DATA ? t("console.demoTitle") : t("console.liveTitle")}</p>
      <p className="mt-1 text-xs leading-5">{USE_DEMO_DATA ? t("console.demoBadge") : t("console.liveBadge")}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-3 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)] ${
        tone === "warning" ? "border-orange-200" : "border-slate-200"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="tnum mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function LoadingList() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={t("console.loadingTitle")}>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-700">{t("console.loadingTitle")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("console.loadingBody")}</p>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-8 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950" role="alert">
      <p className="font-semibold">{t("console.errorTitle")}</p>
      <p className="mt-1 leading-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-[44px] rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-800 transition hover:bg-red-100 active:scale-[0.98]"
      >
        {t("console.retry")}
      </button>
    </div>
  );
}
