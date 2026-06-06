import type { Grade } from "@kaldirim/shared-types";

// Local copies of the Turkish labels + grade colors (kept in sync with
// packages/shared-types) so the native bundle has zero runtime dependency on
// the workspace package — only its TYPES are shared.
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

export const GRADE_COLORS: Record<Grade, string> = {
  A: "#16a34a",
  B: "#65a30d",
  C: "#ca8a04",
  D: "#ea580c",
  E: "#dc2626",
  F: "#991b1b",
};
