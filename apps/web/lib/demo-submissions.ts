import type { ClassCount, Grade } from "@kaldirim/shared-types";

/** Citizen photo report as shown in the municipality console. */
export interface Submission {
  id: string;
  street: string;
  district: string;
  lat: number;
  lng: number;
  score: number;
  grade: Grade;
  pollution_raw: number;
  counts: ClassCount[];
  submitted_at: string;
  limitations: string[];
  /** Hue (0–360) for procedural demo photo placeholder — no binary images. */
  placeholder_hue: number;
}

/** Demo street names for dropdown fallback when Places is unavailable. */
export const DEMO_STREETS = [
  "İstiklal Caddesi",
  "Bağdat Caddesi",
  "Tarlabaşı Bulvarı",
  "Moda Caddesi",
  "Barbaros Bulvarı",
  "Halaskargazi Caddesi",
  "Fıstıkağacı Caddesi",
  "İnönü Caddesi",
] as const;

const LIMITATIONS = [
  "Tek fotoğraf üzerinden hesaplanan skor; sokak genelini temsil etmeyebilir.",
  "Vatandaş fotoğrafı analiz öncesi yüz ve plaka için bulanıklaştırılmıştır; ham görüntü asla saklanmaz.",
  "Gündüz çekimi; aydınlatma koşulları tespit güvenini etkileyebilir.",
];

function counts(
  entries: Array<[string, number, number, number, number]>,
): ClassCount[] {
  return entries.map(([cls, count, avg_confidence, weight, contribution]) => ({
    class: cls,
    count,
    avg_confidence,
    weight,
    contribution,
  }));
}

/** ~20 realistic Istanbul demo submissions — TypeScript only, no image binaries. */
export const DEMO_SUBMISSIONS: Submission[] = [
  {
    id: "sub-001",
    street: "İstiklal Caddesi",
    district: "Beyoğlu",
    lat: 41.0359,
    lng: 28.9778,
    score: 62.4,
    grade: "C",
    pollution_raw: 1.82,
    counts: counts([
      ["garbage", 3, 0.88, 1.2, 0.45],
      ["faded_signage", 2, 0.76, 0.8, 0.22],
      ["culture_sidewalk", 1, 0.91, 1.5, 0.38],
    ]),
    submitted_at: "2026-06-01T14:22:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 168,
  },
  {
    id: "sub-002",
    street: "İstiklal Caddesi",
    district: "Beyoğlu",
    lat: 41.0342,
    lng: 28.9795,
    score: 71.8,
    grade: "B",
    pollution_raw: 1.21,
    counts: counts([["graffiti", 1, 0.82, 0.9, 0.18], ["broken_signage", 1, 0.74, 0.7, 0.12]]),
    submitted_at: "2026-05-28T09:15:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 172,
  },
  {
    id: "sub-003",
    street: "İstiklal Caddesi",
    district: "Beyoğlu",
    lat: 41.0371,
    lng: 28.9761,
    score: 48.2,
    grade: "D",
    pollution_raw: 2.65,
    counts: counts([
      ["garbage", 5, 0.91, 1.2, 0.72],
      ["culture_sidewalk", 2, 0.85, 1.5, 0.55],
      ["unkempt_facade", 1, 0.79, 1.0, 0.28],
    ]),
    submitted_at: "2026-05-25T18:40:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 175,
  },
  {
    id: "sub-004",
    street: "Bağdat Caddesi",
    district: "Kadıköy",
    lat: 40.9634,
    lng: 29.0632,
    score: 84.6,
    grade: "B",
    pollution_raw: 0.78,
    counts: counts([["faded_signage", 1, 0.71, 0.8, 0.09]]),
    submitted_at: "2026-06-02T11:05:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 195,
  },
  {
    id: "sub-005",
    street: "Bağdat Caddesi",
    district: "Kadıköy",
    lat: 40.9658,
    lng: 29.0671,
    score: 91.2,
    grade: "A",
    pollution_raw: 0.32,
    counts: [],
    submitted_at: "2026-05-30T16:30:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 200,
  },
  {
    id: "sub-006",
    street: "Bağdat Caddesi",
    district: "Kadıköy",
    lat: 40.9611,
    lng: 29.0598,
    score: 76.5,
    grade: "B",
    pollution_raw: 1.05,
    counts: counts([
      ["culture_sidewalk", 1, 0.88, 1.5, 0.32],
      ["garbage", 1, 0.83, 1.2, 0.15],
    ]),
    submitted_at: "2026-05-27T08:50:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 188,
  },
  {
    id: "sub-007",
    street: "Tarlabaşı Bulvarı",
    district: "Beyoğlu",
    lat: 41.0378,
    lng: 28.9823,
    score: 38.7,
    grade: "E",
    pollution_raw: 3.42,
    counts: counts([
      ["garbage", 6, 0.89, 1.2, 0.95],
      ["construction_road", 2, 0.86, 1.8, 0.68],
      ["pothole", 1, 0.92, 2.0, 0.55],
    ]),
    submitted_at: "2026-06-03T07:12:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 25,
  },
  {
    id: "sub-008",
    street: "Tarlabaşı Bulvarı",
    district: "Beyoğlu",
    lat: 41.0365,
    lng: 28.9841,
    score: 42.1,
    grade: "D",
    pollution_raw: 2.98,
    counts: counts([
      ["garbage", 4, 0.87, 1.2, 0.62],
      ["graffiti", 2, 0.8, 0.9, 0.28],
      ["unkempt_facade", 2, 0.77, 1.0, 0.35],
    ]),
    submitted_at: "2026-05-29T19:25:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 32,
  },
  {
    id: "sub-009",
    street: "Moda Caddesi",
    district: "Kadıköy",
    lat: 40.9842,
    lng: 29.0256,
    score: 88.3,
    grade: "A",
    pollution_raw: 0.45,
    counts: counts([["faded_signage", 1, 0.69, 0.8, 0.06]]),
    submitted_at: "2026-06-04T13:18:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 210,
  },
  {
    id: "sub-010",
    street: "Moda Caddesi",
    district: "Kadıköy",
    lat: 40.9825,
    lng: 29.0289,
    score: 79.4,
    grade: "B",
    pollution_raw: 0.92,
    counts: counts([["culture_sidewalk", 1, 0.84, 1.5, 0.28]]),
    submitted_at: "2026-05-26T10:42:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 215,
  },
  {
    id: "sub-011",
    street: "Barbaros Bulvarı",
    district: "Beşiktaş",
    lat: 41.0432,
    lng: 29.0098,
    score: 68.9,
    grade: "C",
    pollution_raw: 1.55,
    counts: counts([
      ["broken_signage", 2, 0.81, 0.7, 0.22],
      ["garbage", 2, 0.86, 1.2, 0.32],
    ]),
    submitted_at: "2026-06-01T17:55:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 145,
  },
  {
    id: "sub-012",
    street: "Barbaros Bulvarı",
    district: "Beşiktaş",
    lat: 41.0456,
    lng: 29.0064,
    score: 74.2,
    grade: "B",
    pollution_raw: 1.18,
    counts: counts([["construction_road", 1, 0.79, 1.8, 0.35]]),
    submitted_at: "2026-05-31T12:08:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 150,
  },
  {
    id: "sub-013",
    street: "Halaskargazi Caddesi",
    district: "Şişli",
    lat: 41.0521,
    lng: 28.9876,
    score: 55.6,
    grade: "C",
    pollution_raw: 2.08,
    counts: counts([
      ["garbage", 3, 0.9, 1.2, 0.48],
      ["faded_signage", 2, 0.73, 0.8, 0.2],
      ["graffiti", 1, 0.78, 0.9, 0.15],
    ]),
    submitted_at: "2026-05-24T15:33:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 120,
  },
  {
    id: "sub-014",
    street: "Halaskargazi Caddesi",
    district: "Şişli",
    lat: 41.0498,
    lng: 28.9902,
    score: 63.1,
    grade: "C",
    pollution_raw: 1.74,
    counts: counts([
      ["culture_sidewalk", 2, 0.87, 1.5, 0.42],
      ["broken_signage", 1, 0.76, 0.7, 0.11],
    ]),
    submitted_at: "2026-06-02T09:27:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 125,
  },
  {
    id: "sub-015",
    street: "Fıstıkağacı Caddesi",
    district: "Kadıköy",
    lat: 40.9923,
    lng: 29.0312,
    score: 81.7,
    grade: "B",
    pollution_raw: 0.68,
    counts: counts([["garbage", 1, 0.85, 1.2, 0.12]]),
    submitted_at: "2026-05-28T14:50:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 220,
  },
  {
    id: "sub-016",
    street: "Fıstıkağacı Caddesi",
    district: "Kadıköy",
    lat: 40.9941,
    lng: 29.0288,
    score: 86.4,
    grade: "A",
    pollution_raw: 0.52,
    counts: [],
    submitted_at: "2026-06-03T11:14:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 225,
  },
  {
    id: "sub-017",
    street: "İnönü Caddesi",
    district: "Kadıköy",
    lat: 40.9887,
    lng: 29.0345,
    score: 58.3,
    grade: "C",
    pollution_raw: 1.95,
    counts: counts([
      ["pothole", 2, 0.88, 2.0, 0.62],
      ["garbage", 2, 0.84, 1.2, 0.28],
    ]),
    submitted_at: "2026-05-27T16:05:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 205,
  },
  {
    id: "sub-018",
    street: "İnönü Caddesi",
    district: "Kadıköy",
    lat: 40.9869,
    lng: 29.0371,
    score: 52.8,
    grade: "D",
    pollution_raw: 2.22,
    counts: counts([
      ["construction_road", 1, 0.82, 1.8, 0.38],
      ["culture_sidewalk", 2, 0.86, 1.5, 0.45],
      ["garbage", 1, 0.8, 1.2, 0.14],
    ]),
    submitted_at: "2026-05-23T08:38:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 198,
  },
  {
    id: "sub-019",
    street: "Tarlabaşı Bulvarı",
    district: "Beyoğlu",
    lat: 41.0389,
    lng: 28.9805,
    score: 31.5,
    grade: "F",
    pollution_raw: 3.88,
    counts: counts([
      ["garbage", 7, 0.92, 1.2, 1.05],
      ["pothole", 2, 0.9, 2.0, 0.72],
      ["unkempt_facade", 2, 0.81, 1.0, 0.38],
    ]),
    submitted_at: "2026-06-04T06:45:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 18,
  },
  {
    id: "sub-020",
    street: "İstiklal Caddesi",
    district: "Beyoğlu",
    lat: 41.0335,
    lng: 28.9812,
    score: 67.3,
    grade: "C",
    pollution_raw: 1.62,
    counts: counts([
      ["graffiti", 2, 0.83, 0.9, 0.24],
      ["garbage", 2, 0.87, 1.2, 0.26],
    ]),
    submitted_at: "2026-06-05T20:10:00+03:00",
    limitations: LIMITATIONS,
    placeholder_hue: 165,
  },
];

/** Normalize for loose street-name matching (Turkish İ/I handled loosely). */
export function normalizeStreetName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filterSubmissionsByStreet(
  submissions: Submission[],
  streetFilter: string | null,
): Submission[] {
  if (!streetFilter?.trim()) return submissions;
  const needle = normalizeStreetName(streetFilter);
  return submissions.filter(
    (s) =>
      normalizeStreetName(s.street).includes(needle) ||
      needle.includes(normalizeStreetName(s.street)),
  );
}

export function streetAverageScore(submissions: Submission[]): number | null {
  if (submissions.length === 0) return null;
  const sum = submissions.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / submissions.length) * 10) / 10;
}

export interface StreetAggregate {
  street: string;
  district: string;
  lat: number;
  lng: number;
  avgScore: number;
  grade: Grade;
  count: number;
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  if (score >= 50) return "E";
  return "F";
}

/** Centroid + average per street for aggregate map markers. */
export function computeStreetAggregates(submissions: Submission[]): StreetAggregate[] {
  const byStreet = new Map<string, Submission[]>();
  for (const s of submissions) {
    const list = byStreet.get(s.street) ?? [];
    list.push(s);
    byStreet.set(s.street, list);
  }

  return Array.from(byStreet.entries()).map(([street, items]) => {
    const lat = items.reduce((a, i) => a + i.lat, 0) / items.length;
    const lng = items.reduce((a, i) => a + i.lng, 0) / items.length;
    const avgScore = streetAverageScore(items) ?? 0;
    return {
      street,
      district: items[0].district,
      lat,
      lng,
      avgScore,
      grade: scoreToGrade(avgScore),
      count: items.length,
    };
  });
}

export function getDemoSubmissionById(id: string): Submission | undefined {
  return DEMO_SUBMISSIONS.find((s) => s.id === id);
}
