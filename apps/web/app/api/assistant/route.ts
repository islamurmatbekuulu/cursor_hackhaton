import { NextRequest, NextResponse } from "next/server";
import { DEMO_SUBMISSIONS } from "@/lib/demo-submissions";

// Server-only handler. The Anthropic key is read from process.env at request
// time (Node runtime) and is NEVER returned to the client or logged.
export const runtime = "nodejs";
export const maxDuration = 60;

const API_BASE =
  process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
const USE_DEMO_DATA = process.env.NEXT_PUBLIC_USE_DEMO_DATA !== "false";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Verified available with the provided key on 2026-06-06 via GET /v1/models.
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 1024;
const MAX_HISTORY_MESSAGES = 8;
const MAX_QUESTION_CHARS = 2000;
const UPSTREAM_TIMEOUT_MS = 45_000;
// Anthropic occasionally returns 429/529/5xx under load; retry transient ones.
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3;

// How many rows we surface to the model. Aggregates are always sent; raw rows
// are capped so the payload stays small regardless of dataset size.
const MAX_STREETS = 24;
const MAX_CATEGORIES = 12;
const MAX_RECENT = 8;
const MAX_PRIORITY = 6;

const REPORT_TEXT_FIELDS = ["report", "report_text", "summary", "analysis", "note", "description"] as const;

type ChatRole = "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Internal, derived-only view of a submission used to build the model context.
// Deliberately excludes any imagery, coordinates, or identity-adjacent data.
interface Row {
  id: string;
  street: string;
  district: string;
  score: number;
  grade: string;
  submittedAt: string;
  categories: { name: string; count: number; contribution: number }[];
  reportText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberFrom(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  if (score >= 50) return "E";
  return "F";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rowsFromDemo(): Row[] {
  return DEMO_SUBMISSIONS.map((s) => ({
    id: s.id,
    street: s.street,
    district: s.district,
    score: s.score,
    grade: s.grade,
    submittedAt: s.submitted_at,
    categories: (s.counts ?? []).map((c) => ({
      name: c.class,
      count: c.count,
      contribution: c.contribution,
    })),
  }));
}

function reportTextFrom(record: Record<string, unknown>): string | undefined {
  for (const field of REPORT_TEXT_FIELDS) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function rowFromLive(value: unknown): Row | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const street =
    stringFrom(value.street) || stringFrom(value.street_label) || "Konum etiketi yok";
  const rawCounts = Array.isArray(value.counts) ? value.counts : [];
  const categories = rawCounts
    .filter(isRecord)
    .map((c) => ({
      name: stringFrom(c.class),
      count: numberFrom(c.count),
      contribution: numberFrom(c.contribution),
    }))
    .filter((c) => c.name.length > 0);
  const score = numberFrom(value.score);
  return {
    id: value.id,
    street,
    district: stringFrom(value.district) || "Mobil kamera bildirimi",
    score,
    grade: stringFrom(value.grade) || scoreToGrade(score),
    submittedAt:
      stringFrom(value.submitted_at) ||
      stringFrom(value.created_at) ||
      stringFrom(value.submitted_on),
    categories,
    reportText: reportTextFrom(value),
  };
}

function rowsFromLivePayload(payload: unknown): Row[] {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.submissions)
      ? payload.submissions
      : [];
  return list.map(rowFromLive).filter((r): r is Row => r !== null);
}

async function loadRows(): Promise<{ rows: Row[]; mode: "demo" | "live" }> {
  if (USE_DEMO_DATA) return { rows: rowsFromDemo(), mode: "demo" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/submissions`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`submissions upstream ${upstream.status}`);
    return { rows: rowsFromLivePayload(await upstream.json()), mode: "live" };
  } finally {
    clearTimeout(timer);
  }
}

function topCategoryNames(row: Row, n: number): string[] {
  return [...row.categories]
    .sort((a, b) => (b.contribution || b.count) - (a.contribution || a.count))
    .slice(0, n)
    .map((c) => c.name);
}

function buildSummary(rows: Row[], mode: "demo" | "live") {
  const totalReports = rows.length;
  const overallAverageScore =
    totalReports > 0 ? round1(rows.reduce((acc, r) => acc + r.score, 0) / totalReports) : null;

  const gradeDistribution: Record<string, number> = {};
  for (const r of rows) gradeDistribution[r.grade] = (gradeDistribution[r.grade] ?? 0) + 1;

  const dates = rows
    .map((r) => r.submittedAt)
    .filter((d) => d && Number.isFinite(Date.parse(d)))
    .sort();
  const dateRange = {
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };

  // Per-street aggregates (district + street), dirtiest first.
  const byStreet = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.district}::${r.street}`;
    const list = byStreet.get(key);
    if (list) list.push(r);
    else byStreet.set(key, [r]);
  }
  const streets = [...byStreet.values()]
    .map((list) => {
      const scores = list.map((r) => r.score);
      const avgScore = round1(scores.reduce((a, s) => a + s, 0) / list.length);
      // Use the dataset's own per-report grades (not a recomputed mapping) so
      // the assistant never contradicts the grades shown elsewhere in the UI.
      const grades: Record<string, number> = {};
      for (const r of list) grades[r.grade] = (grades[r.grade] ?? 0) + 1;
      return {
        street: list[0].street,
        district: list[0].district,
        reportCount: list.length,
        avgScore,
        worstScore: round1(Math.min(...scores)),
        bestScore: round1(Math.max(...scores)),
        grades,
      };
    })
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, MAX_STREETS);

  // Pollution category rollup across all reports.
  const catMap = new Map<string, { totalDetections: number; reportCount: number }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const c of r.categories) {
      const entry = catMap.get(c.name) ?? { totalDetections: 0, reportCount: 0 };
      entry.totalDetections += c.count;
      if (!seen.has(c.name)) {
        entry.reportCount += 1;
        seen.add(c.name);
      }
      catMap.set(c.name, entry);
    }
  }
  const topPollutionCategories = [...catMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.totalDetections - a.totalDetections)
    .slice(0, MAX_CATEGORIES);

  const byDateDesc = [...rows].sort(
    (a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0),
  );
  const recentReports = byDateDesc.slice(0, MAX_RECENT).map((r) => ({
    id: r.id,
    street: r.street,
    district: r.district,
    score: r.score,
    grade: r.grade,
    submittedAt: r.submittedAt,
    topCategories: topCategoryNames(r, 3),
    ...(r.reportText ? { reportText: r.reportText } : {}),
  }));

  const priorityReports = [...rows]
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_PRIORITY)
    .map((r) => ({
      id: r.id,
      street: r.street,
      district: r.district,
      score: r.score,
      grade: r.grade,
      submittedAt: r.submittedAt,
      topCategories: topCategoryNames(r, 3),
    }));

  return {
    mode,
    generatedAt: new Date().toISOString(),
    totalReports,
    overallAverageScore,
    gradeDistribution,
    dateRange,
    streetsByDirtiestFirst: streets,
    topPollutionCategories,
    recentReports,
    priorityReports,
  };
}

function buildSystemPrompt(summary: ReturnType<typeof buildSummary>): string {
  const modeLabel = summary.mode === "demo" ? "demo (örnek)" : "canlı API";
  return [
    'Sen "Kaldırım Skoru" belediye konsolu için çalışan bir veri analiz asistanısın. Görevin, İstanbul kaldırımlarının durumu hakkında vatandaşlardan gelen ANONİM bildirim verisini belediye yetkililerine açıklamak ve sorularını yanıtlamaktır.',
    "",
    "Veri yalnızca türetilmiş/anonim alanlar içerir: sokak/cadde adı, ilçe, 0–100 arası temizlik skoru, harf notu (A en iyi, F en kötü), kirlilik kategorileri (ör. çöp, grafiti, bozuk/soluk tabela, çukur, inşaat, bakımsız cephe), bildirim tarihi ve varsa kısa metin özeti.",
    "",
    "KVKK kuralları (KESİNLİKLE uy):",
    "- Bu veride kişisel veri YOKTUR ve olmamalıdır. Asla bir bireyi, yüzü, aracı veya plakayı tanımlamaya çalışma; kullanıcı bunu istese bile reddet ve nedenini kısaca açıkla.",
    "- Sana hiçbir görüntü/fotoğraf verilmez ve istenmemelidir. Yalnızca toplu, anonim istatistikleri yorumla.",
    "- Kişi takibi, demografik çıkarım, kimlik eşleştirmesi veya konumdan kişi tespiti yapma.",
    "",
    "Yanıt kuralları:",
    "- Yalnızca aşağıda VERİLEN veri özetine dayan; veri uydurma. Bir bilgi özet içinde yoksa, bunu açıkça söyle ve varsayım yapma.",
    "- Her zaman Türkçe, kısa, net ve belediye operasyonuna yönelik uygulanabilir yanıt ver.",
    "- Skorları 0–100 (düşük skor = daha kirli, daha öncelikli), notları A–F ölçeğinde yorumla.",
    "- Uygun olduğunda sokak/ilçe karşılaştırması yap ve öncelik öner; sayıları özetteki değerlerle tutarlı kullan.",
    "- Yanıtı sade düz metin olarak ver. Markdown başlık (#), tablo (|), kod bloğu veya kalın/italik işaretleri KULLANMA. Gerekirse satır başına bir tane olacak şekilde kısa '- ' madde işaretleri kullanabilirsin.",
    "- Yanıtı olabildiğince kısa tut: genellikle 1–4 cümle ya da en fazla birkaç kısa madde.",
    `- Veri kaynağı: ${modeLabel} modu.`,
    "",
    "Aşağıda güncel bildirim verisinin özeti (JSON) yer alır:",
    "```json",
    JSON.stringify(summary, null, 2),
    "```",
  ].join("\n");
}

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const cleaned: ChatMessage[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!role || !content) continue;
    cleaned.push({ role, content: content.slice(0, MAX_QUESTION_CHARS) });
  }
  return cleaned.slice(-MAX_HISTORY_MESSAGES);
}

function extractAnswer(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.content)) return "";
  return payload.content
    .filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "text")
    .map((block) => stringFrom(block.text))
    .join("\n")
    .trim();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    // Never echo the key; only report that configuration is missing.
    return NextResponse.json(
      {
        error: "assistant_unconfigured",
        message:
          "Veri asistanı yapılandırılmamış: CLAUDE_API_KEY sunucu ortamında tanımlı değil.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const question =
    isRecord(body) && typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "missing_question", message: "Lütfen bir soru girin." },
      { status: 400 },
    );
  }

  const history = sanitizeHistory(isRecord(body) ? body.messages : undefined);

  let summary: ReturnType<typeof buildSummary>;
  let mode: "demo" | "live";
  try {
    const loaded = await loadRows();
    mode = loaded.mode;
    summary = buildSummary(loaded.rows, loaded.mode);
  } catch (err) {
    return NextResponse.json(
      {
        error: "data_unavailable",
        message: "Bildirim verisi yüklenemedi; lütfen daha sonra tekrar deneyin.",
        detail: String(err),
      },
      { status: 502 },
    );
  }

  const anthropicBody = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    system: buildSystemPrompt(summary),
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: question.slice(0, MAX_QUESTION_CHARS) },
    ],
  };

  // Non-sensitive observability only — never the key, never raw imagery.
  console.info(
    `[assistant] mode=${mode} reports=${summary.totalReports} model=${CLAUDE_MODEL} history=${history.length}`,
  );

  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
        cache: "no-store",
        signal: controller.signal,
      });

      if (upstream.ok) {
        const answer = extractAnswer(await upstream.json());
        if (!answer) {
          return NextResponse.json(
            { error: "empty_answer", message: "Asistan boş bir yanıt döndürdü. Lütfen tekrar deneyin." },
            { status: 502 },
          );
        }
        return NextResponse.json({ answer, mode });
      }

      lastStatus = upstream.status;
      let detail = "";
      try {
        const errJson = await upstream.json();
        if (isRecord(errJson) && isRecord(errJson.error)) {
          detail = `${stringFrom(errJson.error.type)}: ${stringFrom(errJson.error.message)}`;
        }
      } catch {
        // ignore parse failure
      }
      console.error(`[assistant] anthropic error status=${upstream.status} attempt=${attempt} ${detail}`);

      if (!TRANSIENT_STATUSES.has(upstream.status) || attempt === MAX_ATTEMPTS) {
        return NextResponse.json(
          {
            error: "assistant_upstream",
            message: "Claude yanıtı alınamadı. Lütfen tekrar deneyin.",
            status: upstream.status,
          },
          { status: 502 },
        );
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      console.error(`[assistant] request failed attempt=${attempt} aborted=${aborted}: ${String(err)}`);
      if (attempt === MAX_ATTEMPTS) {
        return aborted
          ? NextResponse.json(
              { error: "assistant_timeout", message: "Asistan zaman aşımına uğradı. Lütfen tekrar deneyin." },
              { status: 504 },
            )
          : NextResponse.json(
              { error: "assistant_failed", message: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." },
              { status: 502 },
            );
      }
    } finally {
      clearTimeout(timer);
    }

    // Linear backoff before the next attempt (transient upstream errors only).
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }

  return NextResponse.json(
    {
      error: "assistant_upstream",
      message: "Claude yanıtı alınamadı. Lütfen tekrar deneyin.",
      status: lastStatus,
    },
    { status: 502 },
  );
}
