"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { streetAverageScore, type Submission } from "@/lib/demo-submissions";
import { fetchSubmissions, USE_DEMO_DATA } from "@/lib/submissions";
import { StreetFilter } from "@/components/StreetFilter";
import { SubmissionList } from "@/components/SubmissionList";
import { ReportDetail } from "@/components/ReportDetail";

const SubmissionMap = dynamic(
  () => import("@/components/SubmissionMap").then((m) => m.SubmissionMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[360px] animate-pulse rounded-xl2 bg-slate-200" />
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
  const avg = useMemo(() => streetAverageScore(filtered), [filtered]);
  const selected = filtered.find((s) => s.id === selectedId) ?? null;

  function handleStreetChange(street: string | null) {
    setSelectedStreet(street);
    setSelectedId(null);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl2 border border-slate-200 bg-white p-5 shadow-diffuse">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("console.reportsHeading")}
            </h2>
            <StreetFilter
              selectedStreet={selectedStreet}
              onStreetChange={handleStreetChange}
              mapsEnabled={mapsEnabled}
              streetAverage={avg}
              reportCount={filtered.length}
            />
          </div>

          {USE_DEMO_DATA && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("console.demoBadge")}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-xl2 border border-slate-200 bg-white p-4 shadow-diffuse">
            {loading ? (
              <div className="space-y-2 py-4">
                <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
                <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
              </div>
            ) : (
              <SubmissionList
                submissions={filtered}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            )}
          </div>

          <p className="rounded-lg border border-accent-soft bg-accent-soft/40 px-4 py-3 text-xs text-teal-900">
            {t("kvkk.note")}
          </p>
        </div>

        <div className="min-h-[420px] lg:min-h-[calc(100dvh-12rem)]">
          <SubmissionMap
            submissions={filtered}
            selectedId={selectedId}
            onSelect={handleSelect}
            mapsEnabled={mapsEnabled}
            showAggregates={!selectedStreet}
          />
        </div>
      </div>

      <ReportDetail submission={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
