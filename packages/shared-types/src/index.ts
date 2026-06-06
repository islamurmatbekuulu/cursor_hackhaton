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

/** POST /api/v1/score request body. */
export const ScoreRequest = z.object({
  street: z.string().min(2).max(200),
  max_points: z.number().int().min(1).max(100).optional(),
});
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
