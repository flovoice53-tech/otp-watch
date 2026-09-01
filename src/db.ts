import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../data", import.meta.url), { recursive: true });

export const db = new DatabaseSync(
  new URL("../data/otp-watch.db", import.meta.url).pathname,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A monitor holds ONE persistently-rented number (monthly period, ~7 EUR
  -- flat regardless of message volume) that many checks reuse. This exists
  -- because a fresh "instant" rental per check (the old design) costs
  -- ~0.80 EUR each — fine for an occasional manual check, ruinous for
  -- automated monitoring every 15-30 minutes (would be 1000+ EUR/month for
  -- a single monitored flow). Email has no equivalent cost problem
  -- (receivemail.dev mailbox creation is free/self-serve), so monitors
  -- currently only exist for the sms channel.
  CREATE TABLE IF NOT EXISTS monitors (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    channel TEXT NOT NULL,
    target TEXT NOT NULL,
    upstream_ref TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_monitors_api_key ON monitors(api_key, created_at);

  CREATE TABLE IF NOT EXISTS checks (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    monitor_id TEXT,
    channel TEXT NOT NULL,
    target TEXT,
    upstream_ref TEXT NOT NULL,
    secret TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    timeout_seconds INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    latency_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_checks_api_key ON checks(api_key, started_at);

  CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_request_log_api_key ON request_log(api_key, created_at);
`);

// The 'checks' table predates 'monitor_id' — CREATE TABLE IF NOT EXISTS
// doesn't retrofit columns onto an already-existing table, so a running
// deployment needs this one-time ALTER. Safe to run on every boot: it
// no-ops (caught, ignored) once the column is already there.
try {
  db.exec("ALTER TABLE checks ADD COLUMN monitor_id TEXT");
} catch {
  // already migrated
}

// Only safe to create after the ALTER above guarantees the column exists.
db.exec("CREATE INDEX IF NOT EXISTS idx_checks_monitor_id ON checks(monitor_id, started_at)");

// Billing columns added after monitors were already free/unpaid in v1 — same
// "ALTER on an existing table, no-op if already migrated" pattern as
// monitor_id above. A monitor only becomes usable once the webhook marks it
// 'active' after a real Stripe payment; stripe_session_id is unique so a
// redelivered checkout.session.completed webhook can't create two monitors
// for the same payment.
for (const stmt of [
  "ALTER TABLE monitors ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE monitors ADD COLUMN stripe_customer_id TEXT",
  "ALTER TABLE monitors ADD COLUMN stripe_subscription_id TEXT",
  "ALTER TABLE monitors ADD COLUMN stripe_session_id TEXT",
]) {
  try {
    db.exec(stmt);
  } catch {
    // already migrated
  }
}
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_stripe_session_id ON monitors(stripe_session_id)",
);
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_monitors_stripe_subscription_id ON monitors(stripe_subscription_id)",
);

export function logRequest(apiKey: string | null, method: string, path: string, status: number) {
  db.prepare(
    "INSERT INTO request_log (api_key, method, path, status) VALUES (?, ?, ?, ?)",
  ).run(apiKey, method, path, status);
}
