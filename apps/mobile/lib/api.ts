import { ScorePhotoResponse } from "@kaldirim/shared-types";
import { API_BASE } from "./config";

export type PhotoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
};

/**
 * Uploads a captured photo to the Go API's /api/v1/score/photo endpoint.
 * The backend anonymizes (face/plate blur) before any detector runs.
 */
export async function scorePhoto(uri: string, coords?: PhotoCoords): Promise<ScorePhotoResponse> {
  const form = new FormData();
  const name = uri.split("/").pop() ?? "photo.jpg";
  const type = guessMime(name);

  form.append("image", {
    uri,
    name,
    type,
  } as unknown as Blob);

  if (coords) {
    form.append("lat", String(coords.lat));
    form.append("lng", String(coords.lng));
    if (coords.accuracy != null) {
      form.append("accuracy", String(coords.accuracy));
    }
  }

  const res = await fetch(`${API_BASE}/api/v1/score/photo`, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body.error === "string" ? body.error : `Sunucu hatası (${res.status})`;
    throw new Error(msg);
  }

  const parsed = ScorePhotoResponse.safeParse(body);
  if (!parsed.success) {
    throw new Error("Geçersiz sunucu yanıtı");
  }
  return parsed.data;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
