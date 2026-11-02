export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  /** Text content. Empty while the assistant response is pending. */
  content: string;
  createdAt: number;
  /** True while the model is generating the answer for this message. */
  pending?: boolean;
  /** True when this message represents an error. */
  error?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  /** Max new tokens for generation (1-1024), enforced by the remote API. */
  maxNewTokens: number;
  /** Keepalive ping interval in seconds (10-300). */
  keepAliveSeconds: number;
}

export type HealthStatus = "unknown" | "checking" | "ok" | "error";

export interface HealthData {
  status?: string;
  model?: string;
  gpu?: string;
  precision?: string;
  [key: string]: unknown;
}

/** Normalized answer from /api/health route. */
export interface HealthInfo {
  ok: boolean;
  httpStatus?: number;
  data?: HealthData;
  error?: string;
  detail?: string;
  latencyMs?: number;
}

/** Normalized answer from /api/generate route. */
export type GenerateResult =
  | { ok: true; response: string; model?: string | null }
  | { ok: false; error: string; status?: number; detail?: string };
