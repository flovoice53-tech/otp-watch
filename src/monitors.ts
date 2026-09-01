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
    status: row.status,
  };
}

// Rents the real number and inserts the (not-yet-billed) monitor row.
// Callers are responsible for the payment side — see billing.ts, which
// calls this only after Stripe confirms the first payment, then immediately
// calls activateMonitor to stamp on the Stripe ids.
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

// Any of the key's monitors carries the same Stripe customer id once
// activated (one customer per api key, since checkout always creates a new
// Stripe customer unless one already exists for that email — here we just
// need *a* customer id to open the portal, so the most recent is fine).
export function getStripeCustomerIdForApiKey(apiKey: string): string | null {
  const row = db
    .prepare(
      "SELECT stripe_customer_id FROM monitors WHERE api_key = ? AND stripe_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    )
    .get(apiKey) as { stripe_customer_id: string } | undefined;
  return row?.stripe_customer_id ?? null;
}

export function monitorExistsForStripeSession(stripeSessionId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM monitors WHERE stripe_session_id = ?")
    .get(stripeSessionId);
  return row !== undefined;
}

export function listMonitors(apiKey: string): MonitorResponse[] {
  const rows = db
    .prepare("SELECT * FROM monitors WHERE api_key = ? ORDER BY created_at DESC")
    .all(apiKey) as unknown as MonitorRow[];
  return rows.map(toResponse);
}

// Stamps the Stripe ids onto a just-created monitor. Guarded with INSERT-like
// idempotency via the unique stripe_session_id index: a redelivered
// checkout.session.completed webhook would otherwise call createMonitor()
// again (renting and paying for a second real number) before reaching here —
// callers must check for that first. Here we just make the UPDATE itself
// safe to run twice for the same session (a second call would violate the
// unique index and throw, which is caught by the caller's webhook retry).
export function activateMonitor(
  monitorId: string,
  ids: { stripeCustomerId: string; stripeSubscriptionId: string; stripeSessionId: string },
): void {
  db.prepare(
    `UPDATE monitors
     SET status = 'active', stripe_customer_id = ?, stripe_subscription_id = ?, stripe_session_id = ?
     WHERE id = ?`,
  ).run(ids.stripeCustomerId, ids.stripeSubscriptionId, ids.stripeSessionId, monitorId);
}

export function setMonitorStatusBySubscription(
  stripeSubscriptionId: string,
  status: MonitorRow["status"],
): void {
  db.prepare("UPDATE monitors SET status = ? WHERE stripe_subscription_id = ?").run(
    status,
    stripeSubscriptionId,
  );
}

// The underlying sms-florin rental has its own real 30-day expiry, separate
// from Stripe's billing cycle — the SDK has no "renew" call, only
// rentNumber (which always creates a brand new rental). Stripe's monthly
// interval doesn't land on exactly 30 days every cycle (calendar months
// vary), so waiting for invoice.paid to "extend" a monitor risks a gap
// where the real number has already lapsed and been recycled to another
// customer. Instead, re-rent proactively whenever an active monitor's
// number is close to its real expiry, independent of Stripe's timing —
// called on a periodic sweep from index.ts, not from the webhook.
const RE_RENT_WINDOW_HOURS = 24;

export async function reRentExpiringMonitors(): Promise<void> {
  if (!smsClient) return;
  const rows = db
    .prepare(
      `SELECT * FROM monitors
       WHERE status = 'active' AND datetime(expires_at) <= datetime('now', '+' || ? || ' hours')`,
    )
    .all(RE_RENT_WINDOW_HOURS) as unknown as MonitorRow[];

  for (const row of rows) {
    try {
      const { rentalId } = await smsClient.rentNumber(GENERIC_SMS_SERVICE_SLUG, "monthly");
      const rental = await smsClient.getRental(rentalId);
      const expiresAt = new Date(Date.now() + MONITOR_DURATION_MS).toISOString();
      db.prepare(
        "UPDATE monitors SET target = ?, upstream_ref = ?, expires_at = ? WHERE id = ?",
      ).run(rental.phoneNumber, String(rentalId), expiresAt, row.id);
    } catch (error) {
      console.error(`otp-watch: failed to re-rent monitor ${row.id}:`, error);
    }
  }
}
