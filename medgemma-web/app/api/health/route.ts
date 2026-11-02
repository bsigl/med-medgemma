import { NextResponse } from "next/server";
import { HealthData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Server-side proxy to the MedGemma /health endpoint. The browser calls this
 * route and never sees the API key; the key is attached here from env vars.
 * Used by the client-side keepalive pinger (default every 30 seconds).
 */
export async function GET() {
  const url = process.env.MEDGEMMA_API_URL?.trim();
  const key = process.env.MEDGEMMA_API_KEY?.trim();

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Server is not configured. Set MEDGEMMA_API_URL and MEDGEMMA_API_KEY in the Vercel project environment variables, then redeploy.",
      },
      { status: 500 },
    );
  }

  const base = url.replace(/\/+$/, "");

  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      headers: { "X-API-Key": key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    const raw = await res.text();
    let data: HealthData | null = null;
    try {
      data = raw ? (JSON.parse(raw) as HealthData) : null;
    } catch {
      data = null;
    }

    return NextResponse.json(
      { ok: res.ok, httpStatus: res.status, data },
      { status: res.ok ? 200 : res.status },
    );
  } catch (error) {
    const name = (error as Error)?.name;
    const message =
      name === "TimeoutError" || name === "AbortError"
        ? "The health check timed out — the model server may be busy or the tunnel is slow."
        : "Could not reach the model API. The ngrok URL may be outdated or the Kaggle session stopped.";
    return NextResponse.json(
      { ok: false, error: message, detail: String(error) },
      { status: 502 },
    );
  }
}
