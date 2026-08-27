export type Channel = "sms" | "email";
export type CheckStatus = "pending" | "received" | "timed_out";

export interface CheckRow {
  id: string;
  api_key: string;
  channel: Channel;
  target: string | null;
  upstream_ref: string;
  secret: string | null;
  status: CheckStatus;
  timeout_seconds: number;
  started_at: string;
  resolved_at: string | null;
  latency_ms: number | null;
}

export interface CheckResponse {
  id: string;
  channel: Channel;
  status: CheckStatus;
  target: string | null;
  startedAt: string;
  resolvedAt: string | null;
  latencyMs: number | null;
  timeoutSeconds: number;
}
