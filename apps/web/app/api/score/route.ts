import { NextRequest, NextResponse } from "next/server";

// A street scan (snapToRoads + several Street View panoramas + detection) can
// take tens of seconds, so this proxy must NOT impose a short timeout.
export const runtime = "nodejs";
export const maxDuration = 300; // seconds — serverless function cap (Vercel)

// Proxy to the Go API so backend URL/keys are never exposed to the client.
const API_BASE = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
const UPSTREAM_TIMEOUT_MS = 280_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Forwards the body as-is (street / lat / lng / place_id / max_points) to the
  // Go API. The contract is owned by @kaldirim/shared-types + the Go DTO.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    // Pass the upstream status + body straight through so real backend errors
    // (e.g. 400 "either 'street' or both 'lat' and 'lng' are required") surface.
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json(
        {
          error: "scan timed out",
          detail: `no response from scoring API within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s`,
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "upstream unavailable", detail: String(err) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
