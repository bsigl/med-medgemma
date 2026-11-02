"use client";

import { useEffect, useState } from "react";
import { HealthStatus } from "@/lib/types";

interface StatusPillProps {
  status: HealthStatus;
  lastCheckedAt: number | null;
  onCheck: () => void;
}

/** Live keepalive status indicator with a seconds-ago readout. */
export default function StatusPill({ status, lastCheckedAt, onCheck }: StatusPillProps) {
  const [, forceTick] = useState(0);

  // Re-render every second so the "Xs ago" readout stays live.
  useEffect(() => {
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const label =
    status === "ok"
      ? "API online"
      : status === "checking"
        ? "Checking…"
        : status === "error"
          ? "API offline"
          : "API status unknown";

  const secondsAgo = lastCheckedAt
    ? Math.max(0, Math.round((Date.now() - lastCheckedAt) / 1000))
    : null;

  return (
    <button
      type="button"
      className={`status-pill status-${status}`}
      onClick={onCheck}
      title="Model keepalive status — click to check now"
    >
      <span className="status-dot" aria-hidden="true" />
      <span className="status-text">{label}</span>
      {secondsAgo !== null && secondsAgo < 60 && (
        <span className="status-ago">{secondsAgo}s ago</span>
      )}
    </button>
  );
}
