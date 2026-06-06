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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/score/photo`, {
      method: "POST",
      body: form,
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    // Network-level failure (server unreachable / wrong API_BASE / no LAN route).
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Sunucuya ulaşılamadı (${API_BASE}): ${detail}`);
  }

  // Read the raw text first so non-JSON bodies (proxy/HTML errors) are reportable
  // instead of collapsing to a generic, undiagnosable failure.
  const rawText = await res.text().catch(() => "");
  let body: unknown = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const obj = body as { error?: unknown; message?: unknown } | null;
    const serverMsg =
      obj && typeof obj.message === "string" && obj.message
        ? obj.message
        : obj && typeof obj.error === "string"
          ? obj.error
          : rawText.slice(0, 200);
    throw new Error(`Sunucu hatası (${res.status})${serverMsg ? `: ${serverMsg}` : ""}`);
  }

  const parsed = ScorePhotoResponse.safeParse(body);
  if (!parsed.success) {
    // Surface WHICH fields failed (and the HTTP status) so this is debuggable,
    // rather than the opaque "invalid server response" the old code threw.
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Geçersiz sunucu yanıtı (HTTP ${res.status}) — ${issues || rawText.slice(0, 200)}`);
  }
  return parsed.data;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
