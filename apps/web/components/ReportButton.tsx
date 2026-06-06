"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Papa from "papaparse";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import { CLASS_LABELS_TR, type ScoreResponse } from "@kaldirim/shared-types";

// Register a Unicode font so Turkish glyphs (ş, ğ, ı, İ) render correctly.
// Best-effort: if the CDN is unreachable, react-pdf falls back to Helvetica.
try {
  Font.register({
    family: "OpenSans",
    fonts: [
      { src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-400-normal.woff" },
      {
        src: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-ext-700-normal.woff",
        fontWeight: "bold",
      },
    ],
  });
} catch {
  /* fall back to default font */
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "OpenSans", color: "#0f172a" },
  h1: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  muted: { color: "#64748b", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  section: { marginTop: 16, marginBottom: 6, fontSize: 13, fontWeight: "bold" },
  grade: { fontSize: 40, fontWeight: "bold" },
  cell: { flex: 1 },
});

function ReportDocument({ result, labels }: { result: ScoreResponse; labels: Record<string, string> }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{labels.heading}</Text>
        <Text style={styles.muted}>{labels.addressedTo}</Text>

        <View style={styles.row}>
          <Text>{result.query}</Text>
          <Text style={styles.grade}>{result.grade}</Text>
        </View>
        <View style={styles.row}>
          <Text>Skor</Text>
          <Text>{result.score.toFixed(1)} / 100</Text>
        </View>
        <View style={styles.row}>
          <Text>Kirlilik (ham)</Text>
          <Text>{result.pollution_raw.toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Örnek nokta</Text>
          <Text>{result.points_sampled}</Text>
        </View>

        <Text style={styles.section}>Tespitler</Text>
        {result.counts.length === 0 ? (
          <Text>Tespit bulunamadı.</Text>
        ) : (
          result.counts.map((c) => (
            <View key={c.class} style={styles.row}>
              <Text style={styles.cell}>{labels[c.class] ?? c.class}</Text>
              <Text style={styles.cell}>adet: {c.count}</Text>
              <Text style={styles.cell}>katkı: {c.contribution.toFixed(2)}</Text>
            </View>
          ))
        )}

        <Text style={styles.section}>{labels.formula}</Text>
        <Text style={styles.muted}>
          Katkı = ağırlık × min(adet/P, üst sınır) × ortalama güven; Skor = max(0, 100 − Σ katkı).
        </Text>

        <Text style={{ marginTop: 24, fontSize: 9, color: "#94a3b8" }}>
          {labels.generatedAt}: {new Date().toLocaleString("tr-TR")} — KVKK: ham görüntü saklanmaz, yüz/plaka bulanıklaştırılır.
        </Text>
      </Page>
    </Document>
  );
}

export function ReportButton({ result }: { result: ScoreResponse }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const labels = {
        heading: t("report.heading"),
        addressedTo: t("report.addressedTo"),
        formula: t("report.formula"),
        generatedAt: t("report.generatedAt"),
        ...CLASS_LABELS_TR,
      };
      const blob = await pdf(<ReportDocument result={result} labels={labels} />).toBlob();
      triggerDownload(blob, `kaldirim-skoru-${slug(result.query)}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    const rows = result.counts.map((c) => ({
      sinif: CLASS_LABELS_TR[c.class] ?? c.class,
      adet: c.count,
      ortalama_guven: c.avg_confidence,
      agirlik: c.weight,
      katki: c.contribution,
    }));
    const csv = Papa.unparse(rows);
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `kaldirim-skoru-${slug(result.query)}.csv`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={downloadPdf}
        disabled={busy}
        className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition active:translate-y-px disabled:opacity-50"
      >
        {busy ? t("report.generating") : t("report.pdf")}
      </button>
      <button
        onClick={downloadCsv}
        className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition active:translate-y-px"
      >
        {t("report.csv")}
      </button>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "rapor";
}
