"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { ScoreResponse } from "@kaldirim/shared-types";
import { StreetSearch } from "@/components/StreetSearch";
import { ScoreCard } from "@/components/ScoreCard";
import { ReportButton } from "@/components/ReportButton";

// Leaflet touches window — load the map only on the client.
const Heatmap = dynamic(() => import("@/components/Heatmap").then((m) => m.Heatmap), {
  ssr: false,
  loading: () => <div className="h-full min-h-[360px] animate-pulse rounded-xl2 bg-slate-200" />,
});

type Status = "idle" | "loading" | "error" | "done";

export default function Page() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ScoreResponse | null>(null);

  async function handleSubmit(street: string) {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ street }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const parsed = ScoreResponse.safeParse(json);
      if (!parsed.success) throw new Error("invalid response shape");
      setResult(parsed.data);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-7xl px-4 py-8 md:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          {t("app.title")}
        </h1>
        <p className="mt-1 max-w-[60ch] text-slate-600">{t("app.tagline")}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Left: search + score */}
        <div className="flex flex-col gap-6">
          <div className="rounded-xl2 border border-slate-200 bg-white p-6 shadow-diffuse">
            <StreetSearch onSubmit={handleSubmit} loading={status === "loading"} />
          </div>

          {status === "loading" && <LoadingCard message={t("states.loading")} />}

          {status === "error" && (
            <ErrorCard
              title={t("states.errorTitle")}
              retry={t("states.retry")}
              onRetry={() => setStatus("idle")}
            />
          )}

          {status === "idle" && (
            <EmptyCard title={t("states.emptyTitle")} body={t("states.emptyBody")} />
          )}

          {status === "done" && result && (
            <>
              <ScoreCard result={result} />
              <ReportButton result={result} />
            </>
          )}

          <p className="rounded-lg border border-accent-soft bg-accent-soft/40 px-4 py-3 text-xs text-teal-900">
            {t("kvkk.note")}
          </p>
        </div>

        {/* Right: map */}
        <div className="min-h-[420px]">
          <Heatmap result={status === "done" ? result : null} />
        </div>
      </div>
    </main>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl2 border border-slate-200 bg-white p-6 shadow-diffuse">
      <div className="mb-4 h-16 w-16 animate-pulse rounded-2xl bg-slate-200" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
      </div>
      <p className="mt-4 text-sm text-slate-500">{message}</p>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl2 border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-[40ch] text-sm text-slate-500">{body}</p>
    </div>
  );
}

function ErrorCard({ title, retry, onRetry }: { title: string; retry: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl2 border border-red-200 bg-red-50 p-6">
      <h2 className="text-base font-semibold text-red-800">{title}</h2>
      <button
        onClick={onRetry}
        className="mt-3 min-h-[44px] rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 transition active:translate-y-px"
      >
        {retry}
      </button>
    </div>
  );
}
