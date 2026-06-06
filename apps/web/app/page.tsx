"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useTranslation } from "react-i18next";
import { SubmissionConsole } from "@/components/SubmissionConsole";

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAPS_ENABLED = Boolean(BROWSER_KEY && BROWSER_KEY.length > 0);

export default function Page() {
  const { t } = useTranslation();

  const content = <SubmissionConsole mapsEnabled={MAPS_ENABLED} />;

  return (
    <main id="main-content" className="mx-auto min-h-[100dvh] max-w-7xl px-4 py-4 md:px-8 md:py-5">
      <a
        href="#console-workbench"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-slate-950 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-4 focus:ring-accent/40"
      >
        {t("app.skip")}
      </a>
      <header className="mb-4 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-diffuse">
        <div className="grid gap-4 p-4 md:grid-cols-[1.5fr_0.8fr] md:p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
              {t("app.eyebrow")}
            </p>
            <h1 className="mt-2 max-w-[18ch] text-2xl font-bold tracking-tight text-slate-950 md:text-4xl">
              {t("app.title")}
            </h1>
            <p className="mt-3 max-w-[66ch] text-sm leading-6 text-slate-600 md:text-base">
              {t("app.tagline")}
            </p>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="w-fit rounded-full border border-accent/20 bg-accent-soft/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-900">
              {t("app.badge")}
            </span>
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-500">{t("app.updated")}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{t("kvkk.note")}</p>
            </div>
          </div>
        </div>
      </header>

      {MAPS_ENABLED ? (
        <APIProvider apiKey={BROWSER_KEY as string} libraries={["places"]}>
          {content}
        </APIProvider>
      ) : (
        content
      )}
    </main>
  );
}
