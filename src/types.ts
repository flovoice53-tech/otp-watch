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

export type MonitorStatus = "active" | "past_due" | "canceled";

export interface MonitorRow {
  id: string;
  api_key: string;
  channel: Channel;
  target: string;
  upstream_ref: string;
  created_at: string;
  expires_at: string;
  status: MonitorStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_session_id: string | null;
}

export interface MonitorResponse {
  id: string;
  channel: Channel;
  target: string;
  createdAt: string;
  expiresAt: string;
  status: MonitorStatus;
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
