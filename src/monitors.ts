import { nanoid } from "nanoid";
import { SmsFlorinClient } from "sms-florin";
import { db } from "./db.js";
import type { MonitorResponse, MonitorRow } from "./types.js";

const GENERIC_SMS_SERVICE_SLUG = "yahoo";
const MONITOR_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // matches sms-florin's own monthly-rental window

const smsApiKey = process.env.SMS_FLORIN_API_KEY;
const smsClient = smsApiKey
  ? new SmsFlorinClient(smsApiKey, { baseUrl: process.env.SMS_FLORIN_BASE_URL })
  : null;

function toRow(id: string): MonitorRow | undefined {
  return db.prepare("SELECT * FROM monitors WHERE id = ?").get(id) as MonitorRow | undefined;
}

function toResponse(row: MonitorRow): MonitorResponse {
  return {
    id: row.id,
    channel: row.channel,
    target: row.target,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function createMonitor(apiKey: string): Promise<MonitorResponse> {
  // Only "sms" needs this — a rented number is the one resource with a real
  // per-check cost, so it's worth reusing across many checks. Email mailbox
  // creation via receivemail.dev is free/self-serve, so an ad-hoc POST
  // /checks per check is already cheap enough and doesn't need this.
  if (!smsClient) throw new Error("SMS monitors are not configured on this server.");

  const { rentalId } = await smsClient.rentNumber(GENERIC_SMS_SERVICE_SLUG, "monthly");
  const rental = await smsClient.getRental(rentalId);
  const id = nanoid(16);
  const expiresAt = new Date(Date.now() + MONITOR_DURATION_MS).toISOString();

  db.prepare(
    `INSERT INTO monitors (id, api_key, channel, target, upstream_ref, expires_at)
     VALUES (?, ?, 'sms', ?, ?, ?)`,
  ).run(id, apiKey, rental.phoneNumber, String(rentalId), expiresAt);

  return toResponse(toRow(id)!);
}

export function getMonitor(apiKey: string, id: string): MonitorRow | null {
  const row = toRow(id);
  if (!row || row.api_key !== apiKey) return null;
  return row;
}

export function listMonitors(apiKey: string): MonitorResponse[] {
  const rows = db
    .prepare("SELECT * FROM monitors WHERE api_key = ? ORDER BY created_at DESC")
    .all(apiKey) as unknown as MonitorRow[];
  return rows.map(toResponse);
}
