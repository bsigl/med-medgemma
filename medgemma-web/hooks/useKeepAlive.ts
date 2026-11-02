"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HealthInfo, HealthStatus } from "@/lib/types";

/**
 * Keepalive / pooling mechanism.
 *
 * While the app is open it pings the server route /api/health every
 * `intervalSeconds` (default 30s). The route proxies to the MedGemma
 * /health endpoint with the secret API key. This:
 *   1. keeps the FastAPI/ngrok path warm,
 *   2. immediately shows in the UI when the Kaggle session or ngrok
 *      tunnel went away.
 */
export function useKeepAlive(intervalSeconds: number) {
  const [status, setStatus] = useState<HealthStatus>("unknown");
  const [info, setInfo] = useState<HealthInfo | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const startedAt = Date.now();
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | (HealthInfo & { ok?: boolean })
        | null;
      const ok = Boolean(payload?.ok) && res.ok;
      setInfo({
        ok,
        httpStatus: res.status,
        data: payload?.data,
        error: payload?.error,
        detail: payload?.detail,
        latencyMs: Date.now() - startedAt,
      });
      setStatus(ok ? "ok" : "error");
    } catch (error) {
      setInfo({
        ok: false,
        error: "Network error while checking the API health.",
        detail: String(error),
        latencyMs: Date.now() - startedAt,
      });
      setStatus("error");
    } finally {
      inFlight.current = false;
      setLastCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void check();
    const ms = Math.max(5, intervalSeconds) * 1000;
    const timer = window.setInterval(() => void check(), ms);
    return () => window.clearInterval(timer);
  }, [check, intervalSeconds]);

  return { status, info, lastCheckedAt, check };
}
