import { nanoid } from "nanoid";
import { SmsFlorinClient } from "sms-florin";
import { db } from "./db.js";
import { getMonitor } from "./monitors.js";
import type { CheckResponse, CheckRow, Channel } from "./types.js";

const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_TIMEOUT_SECONDS = 600;

// Any SMS sent to a rented number is captured regardless of sender or the
// service label it was rented under (confirmed against sms-florin's own
// webhook-matching logic: it matches by SIM/port + active rental, not by
// sender) — so the cheapest service slug works fine as a generic "receive
// anything" number for monitoring purposes.
const GENERIC_SMS_SERVICE_SLUG = "yahoo";

const smsApiKey = process.env.SMS_FLORIN_API_KEY;
if (!smsApiKey) {
  console.error("SMS_FLORIN_API_KEY is not set — SMS checks will fail.");
}
const smsClient = smsApiKey
  ? new SmsFlorinClient(smsApiKey, { baseUrl: process.env.SMS_FLORIN_BASE_URL })
  : null;

const RECEIVEMAIL_BASE_URL = process.env.RECEIVEMAIL_BASE_URL ?? "https://receivemail.dev";

function toRow(id: string): CheckRow | undefined {
  return db.prepare("SELECT * FROM checks WHERE id = ?").get(id) as CheckRow | undefined;
}

function toResponse(row: CheckRow): CheckResponse {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    channel: row.channel,
    status: row.status,
    target: row.target,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    latencyMs: row.latency_ms,
    timeoutSeconds: row.timeout_seconds,
  };
}

function clampTimeout(timeoutSeconds: number | undefined): number {
  const t = timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.max(t, 10), MAX_TIMEOUT_SECONDS);
}

export async function startCheck(
  apiKey: string,
  channel: Channel,
  timeoutSeconds?: number,
): Promise<CheckResponse> {
  const timeout = clampTimeout(timeoutSeconds);
  const id = nanoid(16);

  if (channel === "sms") {
    if (!smsClient) throw new Error("SMS checks are not configured on this server.");
    const { rentalId } = await smsClient.rentNumber(GENERIC_SMS_SERVICE_SLUG, "instant");
    const rental = await smsClient.getRental(rentalId);
    db.prepare(
      `INSERT INTO checks (id, api_key, channel, target, upstream_ref, timeout_seconds)
       VALUES (?, ?, 'sms', ?, ?, ?)`,
    ).run(id, apiKey, rental.phoneNumber, String(rentalId), timeout);
  } else {
    const res = await fetch(`${RECEIVEMAIL_BASE_URL}/mailboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ttlMinutes: Math.min(Math.ceil(timeout / 60) + 1, 60) }),
    });
    if (!res.ok) throw new Error(`Failed to create test mailbox: ${res.status}`);
    const data = (await res.json()) as { address: string; secret: string };
    db.prepare(
      `INSERT INTO checks (id, api_key, channel, target, upstream_ref, secret, timeout_seconds)
       VALUES (?, ?, 'email', ?, ?, ?, ?)`,
    ).run(id, apiKey, data.address, data.address, data.secret, timeout);
  }

  return toResponse(toRow(id)!);
}

export function startMonitorCheck(
  apiKey: string,
  monitorId: string,
  timeoutSeconds?: number,
): CheckResponse {
  const monitor = getMonitor(apiKey, monitorId);
  if (!monitor) throw new Error("monitor not found");

  const timeout = clampTimeout(timeoutSeconds);
  const id = nanoid(16);

  db.prepare(
    `INSERT INTO checks (id, api_key, monitor_id, channel, target, upstream_ref, timeout_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, apiKey, monitor.id, monitor.channel, monitor.target, monitor.upstream_ref, timeout);

  return toResponse(toRow(id)!);
}

async function resolveIfPossible(row: CheckRow): Promise<CheckRow> {
  if (row.status !== "pending") return row;

  const startedAtMs = new Date(row.started_at + "Z").getTime();
  const deadlineMs = startedAtMs + row.timeout_seconds * 1000;
  const nowMs = Date.now();

  let receivedAtMs: number | null = null;

  if (row.channel === "sms") {
    if (!smsClient) throw new Error("SMS checks are not configured on this server.");
    const rental = await smsClient.getRental(Number(row.upstream_ref));
    if (row.monitor_id) {
      // A monitor's number is reused across many checks, so its message
      // list accumulates history — only a message that arrived after THIS
      // check started counts as this check's result.
      const relevant = rental.messages
        .map((m) => new Date(m.receivedAt).getTime())
        .filter((t) => t >= startedAtMs)
        .sort((a, b) => a - b);
      if (relevant.length > 0) receivedAtMs = relevant[0];
    } else if (rental.messages.length > 0) {
      // Ad-hoc (non-monitor) checks use a fresh "instant" rental that closes
      // on its first-ever message, so there's nothing to filter.
      receivedAtMs = new Date(rental.messages[0].receivedAt).getTime();
    }
  } else {
    const res = await fetch(
      `${RECEIVEMAIL_BASE_URL}/mailboxes/${encodeURIComponent(row.upstream_ref)}/messages`,
      { headers: { authorization: `Bearer ${row.secret}` } },
    );
    if (res.ok) {
      const messages = (await res.json()) as Array<{ receivedAt: string }>;
      if (messages.length > 0) {
        receivedAtMs = new Date(messages[0].receivedAt).getTime();
      }
    }
  }

  if (receivedAtMs !== null) {
    const latencyMs = receivedAtMs - startedAtMs;
    db.prepare(
      "UPDATE checks SET status = 'received', resolved_at = datetime('now'), latency_ms = ? WHERE id = ?",
    ).run(latencyMs, row.id);
    return toRow(row.id)!;
  }

  if (nowMs > deadlineMs) {
    db.prepare(
      "UPDATE checks SET status = 'timed_out', resolved_at = datetime('now') WHERE id = ?",
    ).run(row.id);
    return toRow(row.id)!;
  }

  return row;
}

export async function getCheck(apiKey: string, id: string): Promise<CheckResponse | null> {
  const row = toRow(id);
  if (!row || row.api_key !== apiKey) return null;
  const resolved = await resolveIfPossible(row);
  return toResponse(resolved);
}

export function listChecks(apiKey: string, limit = 50) {
  const rows = db
    .prepare(
      "SELECT * FROM checks WHERE api_key = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(apiKey, limit) as unknown as CheckRow[];
  return rows.map(toResponse);
}
