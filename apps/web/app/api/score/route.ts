import { NextRequest, NextResponse } from "next/server";

// Proxy to the Go API so backend URL/keys are never exposed to the client.
const API_BASE = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
