import {
  DEMO_SUBMISSIONS,
  filterSubmissionsByStreet,
  type Submission,
} from "@/lib/demo-submissions";

/** Default true until Go submissions API is deployed. Set to "false" for live data. */
export const USE_DEMO_DATA = process.env.NEXT_PUBLIC_USE_DEMO_DATA !== "false";

export async function fetchSubmissions(street?: string | null): Promise<Submission[]> {
  if (USE_DEMO_DATA) {
    return filterSubmissionsByStreet(DEMO_SUBMISSIONS, street ?? null);
  }

  const params = street?.trim() ? `?street=${encodeURIComponent(street.trim())}` : "";
  const res = await fetch(`/api/submissions${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`submissions fetch failed (${res.status})`);
  }
  return (await res.json()) as Submission[];
}

export function submissionImageUrl(id: string): string {
  if (USE_DEMO_DATA) return "";
  return `/api/submissions/${encodeURIComponent(id)}/image`;
}
