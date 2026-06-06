import {
  DEMO_SUBMISSIONS,
  filterSubmissionsByStreet,
  type Submission,
} from "@/lib/demo-submissions";
import type { Grade } from "@kaldirim/shared-types";

/** Default true until Go submissions API is deployed. Set to "false" for live data. */
export const USE_DEMO_DATA = process.env.NEXT_PUBLIC_USE_DEMO_DATA !== "false";

const DEMO_VISIBLE_LIMIT = 10;
const GRADES: Grade[] = ["A", "B", "C", "D", "E", "F"];

const LIVE_LIMITATIONS = [
  "Canlı API kaydı; vatandaş fotoğrafı analizden önce yüz ve plaka için bulanıklaştırılmıştır.",
  "Belediye konsolu ham görüntüyü asla saklamaz; yalnızca bulanıklaştırılmış fotoğraf belediye incelemesine açılır.",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function gradeFrom(value: unknown): Grade {
  return GRADES.includes(value as Grade) ? (value as Grade) : "C";
}

function numberFrom(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hueFromId(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return (hash + 120) % 360;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function submittedAtFrom(value: Record<string, unknown>): string {
  return (
    stringFrom(value.submitted_at) ??
    stringFrom(value.created_at) ??
    stringFrom(value.submitted_on) ??
    ""
  );
}

function timestampOf(submission: Submission): number {
  const time = Date.parse(submission.submitted_at);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function sortNewestFirst(submissions: Submission[]): Submission[] {
  return submissions
    .map((submission, index) => ({ submission, index }))
    .sort((a, b) => {
      const diff = timestampOf(b.submission) - timestampOf(a.submission);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ submission }) => submission);
}

function normalizeSubmission(value: unknown): Submission | null {
  if (isRecord(value) && typeof value.id === "string" && typeof value.street === "string") {
    return {
      id: value.id,
      street: value.street,
      district: stringFrom(value.district) ?? "Mobil kamera bildirimi",
      lat: numberFrom(value.lat),
      lng: numberFrom(value.lng),
      score: numberFrom(value.score),
      grade: gradeFrom(value.grade),
      pollution_raw: numberFrom(value.pollution_raw),
      counts: Array.isArray(value.counts) ? value.counts : [],
      limitations: Array.isArray(value.limitations) ? value.limitations : LIVE_LIMITATIONS,
      submitted_at: submittedAtFrom(value),
      placeholder_hue:
        typeof value.placeholder_hue === "number" ? value.placeholder_hue : hueFromId(value.id),
    };
  }

  if (!isRecord(value) || typeof value.id !== "string") return null;

  const street = typeof value.street_label === "string" ? value.street_label : "Konum etiketi yok";
  return {
    id: value.id,
    street,
    district: "Mobil kamera bildirimi",
    lat: numberFrom(value.lat),
    lng: numberFrom(value.lng),
    score: numberFrom(value.score),
    grade: gradeFrom(value.grade),
    pollution_raw: numberFrom(value.pollution_raw),
    counts: Array.isArray(value.counts) ? (value.counts as Submission["counts"]) : [],
    submitted_at: submittedAtFrom(value),
    limitations: LIVE_LIMITATIONS,
    placeholder_hue: hueFromId(value.id),
  };
}

function normalizePayload(payload: unknown): Submission[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.submissions)
      ? payload.submissions
      : [];
  return rows.map(normalizeSubmission).filter((s): s is Submission => s !== null);
}

export async function fetchSubmissions(street?: string | null): Promise<Submission[]> {
  if (USE_DEMO_DATA) {
    return sortNewestFirst(filterSubmissionsByStreet(DEMO_SUBMISSIONS, street ?? null)).slice(0, DEMO_VISIBLE_LIMIT);
  }

  const params = street?.trim() ? `?street=${encodeURIComponent(street.trim())}` : "";
  const res = await fetch(`/api/submissions${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`submissions fetch failed (${res.status})`);
  }
  return sortNewestFirst(normalizePayload(await res.json()));
}

export function submissionImageUrl(id: string): string {
  if (USE_DEMO_DATA) return "";
  return `/api/submissions/${encodeURIComponent(id)}/image`;
}
