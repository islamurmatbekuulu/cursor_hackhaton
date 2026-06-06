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
    <main className="mx-auto min-h-[100dvh] max-w-7xl px-4 py-8 md:px-8">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">{t("app.badge")}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          {t("app.title")}
        </h1>
        <p className="mt-1 max-w-[60ch] text-slate-600">{t("app.tagline")}</p>
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
