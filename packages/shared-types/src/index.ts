/**
 * Kaldırım Skoru shared contracts (zod schemas + inferred TS types).
 *
 * These MIRROR the Go domain types in
 * services/api/internal/domain/walkability/model. Web and mobile consume the
 * same ScoreResponse shape so the ScoreCard renders identically on both.
 */
import { z } from "zod";

/** Canonical merged urban-object class allowlist (matches the Go/sidecar boundary). */
export const PollutionClass = z.enum([
  "pothole",
  "garbage",
  "construction_road",
  "culture_sidewalk",
  "broken_signage",
  "faded_signage",
  "graffiti",
  "unkempt_facade",
]);
export type PollutionClass = z.infer<typeof PollutionClass>;

/** A–F letter grade. */
export const Grade = z.enum(["A", "B", "C", "D", "E", "F"]);
export type Grade = z.infer<typeof Grade>;

export const GeoPoint = z.object({
  lat: z.number(),
  lng: z.number(),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** A single detection on an already-anonymized image. */
export const Detection = z.object({
  class: z.string(),
  confidence: z.number(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type Detection = z.infer<typeof Detection>;

/** Per-point detection result (no face/plate identity data — KVKK). */
export const PointResult = z.object({
  point: GeoPoint,
  pano_id: z.string().optional(),
  pano_date: z.string().optional(),
  headings: z.array(z.number()).optional(),
  detections: z.array(Detection),
  weight: z.number(),
});
export type PointResult = z.infer<typeof PointResult>;

/** Aggregated per-class summary. */
export const ClassCount = z.object({
  class: z.string(),
  count: z.number(),
  avg_confidence: z.number(),
  weight: z.number(),
  contribution: z.number(),
});
export type ClassCount = z.infer<typeof ClassCount>;

/**
 * POST /api/v1/score request body.
 *
 * Coordinate path: when the client already has a coordinate (e.g. from Google
 * Places Autocomplete) it may send `lat` + `lng` and the backend SKIPS
 * geocoding, using them as the snapToRoads seed. Otherwise `street` is geocoded.
 * `street` is therefore required ONLY when `lat`/`lng` are absent — enforced via
 * a refinement so the error is explicit. `place_id` is accepted for
 * logging/diagnostics only.
 *
 * Wire keys are snake_case (`place_id`) to match the Go DTO exactly.
 */
export const ScoreRequest = z
  .object({
    street: z.string().min(2).max(200).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    place_id: z.string().max(256).optional(),
    max_points: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (v) => (typeof v.lat === "number" && typeof v.lng === "number") || (v.street?.trim().length ?? 0) >= 2,
    { message: "either 'street' or both 'lat' and 'lng' are required" },
  );
export type ScoreRequest = z.infer<typeof ScoreRequest>;

/** The full scoring response returned by the Go API (model.StreetScore). */
export const ScoreResponse = z.object({
  query: z.string(),
  score: z.number(),
  grade: Grade,
  pollution_raw: z.number(),
  points_sampled: z.number(),
  counts: z.array(ClassCount),
  points: z.array(PointResult),
  panorama_dates: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
});
export type ScoreResponse = z.infer<typeof ScoreResponse>;

/**
 * Multipart fields for POST /api/v1/score/photo (documented contract; not JSON).
 * Wire keys are snake_case to match the Go handler.
 */
export const ScorePhotoRequest = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});
export type ScorePhotoRequest = z.infer<typeof ScorePhotoRequest>;

/** POST /api/v1/score/photo response — score payload plus persistence metadata. */
export const ScorePhotoResponse = ScoreResponse.extend({
  submission_id: z.string().uuid().optional(),
  persisted: z.boolean(),
  street_label: z.string().optional(),
});
export type ScorePhotoResponse = z.infer<typeof ScorePhotoResponse>;

/** A persisted mobile camera submission (list view; no image bytes). */
export const Submission = z.object({
  id: z.string().uuid(),
  submitted_on: z.string(),
  lat: z.number(),
  lng: z.number(),
  accuracy_m: z.number().optional(),
  street_label: z.string(),
  street_label_key: z.string(),
  score: z.number(),
  grade: Grade,
  pollution_raw: z.number(),
  counts: z.array(ClassCount),
  source: z.literal("camera"),
});
export type Submission = z.infer<typeof Submission>;

/** Average score grouped by street for map overlays. */
export const StreetAggregate = z.object({
  street_label_key: z.string(),
  street_label: z.string(),
  avg_score: z.number(),
  grade: Grade,
  count: z.number().int(),
});
export type StreetAggregate = z.infer<typeof StreetAggregate>;

/** GET /api/v1/submissions response. */
export const SubmissionMapResponse = z.object({
  submissions: z.array(Submission),
  street_aggregates: z.array(StreetAggregate),
});
export type SubmissionMapResponse = z.infer<typeof SubmissionMapResponse>;

/** Human-readable Turkish labels for each class (UI chips). */
export const CLASS_LABELS_TR: Record<string, string> = {
  pothole: "Çukur",
  garbage: "Çöp",
  construction_road: "İnşaat/Moloz",
  culture_sidewalk: "Kaldırım İşgali",
  broken_signage: "Bozuk Tabela",
  faded_signage: "Solmuş Tabela",
  graffiti: "Grafiti",
  unkempt_facade: "Bakımsız Cephe",
};

/** Grade → hex color for pills/heatmap legends. */
export const GRADE_COLORS: Record<Grade, string> = {
  A: "#16a34a",
  B: "#65a30d",
  C: "#ca8a04",
  D: "#ea580c",
  E: "#dc2626",
  F: "#991b1b",
};
