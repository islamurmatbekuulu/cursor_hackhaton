import type { ScoreResponse } from "@kaldirim/shared-types";
import { API_BASE } from "./config";

/**
 * Uploads a captured photo to the Go API's /api/v1/score/photo endpoint.
 * The backend anonymizes (face/plate blur) before any detector runs.
 */
export async function scorePhoto(uri: string): Promise<ScoreResponse> {
  const form = new FormData();
  const name = uri.split("/").pop() ?? "photo.jpg";
  const type = guessMime(name);

  // React Native FormData file shape.
  form.append("image", {
    uri,
    name,
    type,
  } as unknown as Blob);

  const res = await fetch(`${API_BASE}/api/v1/score/photo`, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Sunucu hatası (${res.status})`);
  }
  return (await res.json()) as ScoreResponse;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
