import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

// Forwards a multipart photo upload to the Go API (shared with the Expo flow).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const upstream = await fetch(`${API_BASE}/api/v1/score/photo`, {
      method: "POST",
      body: form,
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
