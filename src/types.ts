export type Channel = "sms" | "email";
export type CheckStatus = "pending" | "received" | "timed_out";

export interface CheckRow {
  id: string;
  api_key: string;
  monitor_id: string | null;
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

export interface MonitorRow {
  id: string;
  api_key: string;
  channel: Channel;
  target: string;
  upstream_ref: string;
  created_at: string;
  expires_at: string;
}

export interface MonitorResponse {
  id: string;
  channel: Channel;
  target: string;
  createdAt: string;
  expiresAt: string;
}

export interface CheckResponse {
  id: string;
  monitorId: string | null;
  channel: Channel;
  status: CheckStatus;
  target: string | null;
  startedAt: string;
  resolvedAt: string | null;
  latencyMs: number | null;
  timeoutSeconds: number;
}
