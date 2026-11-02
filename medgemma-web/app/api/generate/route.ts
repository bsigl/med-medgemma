import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serverless execution time budget.
 *
 * Vercel Hobby: 60s max unless Fluid compute is enabled; Pro: up to 300s.
 * Generation on a T4 with 512 tokens can take 30-90s — if a deploy rejects
 * this value or long answers get cut off on your plan, change it to 60
 * (and/or upgrade the plan).
 */
export const maxDuration = 300;

const MAX_PROMPT_LENGTH = 12_000;
const TIMEOUT_MS = 280_000; // leave headroom under maxDuration

interface GenerateBody {
  prompt?: unknown;
  maxNewTokens?: unknown;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function friendlyError(status: number, data: unknown): string {
  const detail =
    data && typeof data === "object" && "detail" in data && typeof (data as { detail?: unknown }).detail === "string"
      ? ((data as { detail: string }).detail as string)
      : undefined;
  switch (status) {
    case 400:
      return detail ? `The model API rejected the request: ${detail}` : "The model API rejected the request.";
    case 401:
    case 403:
      return "Unauthorized: your MEDGEMMA_API_KEY was rejected by the model API.";
    case 404:
      return "Endpoint not found: the ngrok URL is probably outdated or the Kaggle session stopped. Update MEDGEMMA_API_URL and redeploy.";
    case 405:
      return "Method not allowed: the model API does not accept POST on /generate. Check the notebook server.";
    case 422:
      return detail ? `Validation error from the model API: ${detail}` : "The model API rejected the request format.";
    case 429:
      return "Too many requests: the model API is rate limiting. Wait a moment and try again.";
    case 500:
    case 502:
    case 503:
    case 504:
      return `The model API reported a server error (${status}). The Kaggle session may have crashed — check the notebook.`;
    default:
      return detail ? `Model API error ${status}: ${detail}` : `Model API error ${status}.`;
  }
}

/**
 * POST /api/generate
 * Body: { prompt: string, maxNewTokens?: number }
 *
 * Proxies a single, stateless prompt to the MedGemma POST /generate endpoint.
 * No conversation history is attached — each request is independent, matching
 * the API's stateless design. The API key never leaves the server.
 */
export async function POST(req: NextRequest) {
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

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body: expected a JSON object." },
      { status: 400 },
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "Prompt is required." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Prompt is too long (max ${MAX_PROMPT_LENGTH.toLocaleString()} characters).` },
      { status: 400 },
    );
  }

  const maxNewTokens = clampInt(Number(body.maxNewTokens) || 1024, 1, 1024, 1024);
  const base = url.replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key, Accept: "application/json" },
      body: JSON.stringify({ prompt, max_new_tokens: maxNewTokens }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The model took too long to respond and the request timed out. Try again with a lower 'Max new tokens' value.",
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not reach the model API. The ngrok URL may be outdated or the Kaggle session stopped. Update MEDGEMMA_API_URL and redeploy.",
        detail: String(error),
      },
      { status: 502 },
    );
  }

  const raw = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: friendlyError(res.status, data), status: res.status },
      { status: res.status },
    );
  }

  const response = data && typeof data.response === "string" ? data.response : null;
  if (!response) {
    return NextResponse.json(
      { ok: false, error: "The model API returned an unexpected response (missing 'response' field)." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    response,
    model: typeof data?.model === "string" ? data.model : null,
  });
}
