import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

/** Proxy GET /api/v1/submissions — demo mode uses local data on the client instead. */
export async function GET(req: NextRequest) {
  const street = req.nextUrl.searchParams.get("street");
  const params = street ? `?street=${encodeURIComponent(street)}` : "";

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/submissions${params}`, {
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "upstream unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}
