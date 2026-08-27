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

  CREATE TABLE IF NOT EXISTS checks (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
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

export function logRequest(apiKey: string | null, method: string, path: string, status: number) {
  db.prepare(
    "INSERT INTO request_log (api_key, method, path, status) VALUES (?, ?, ?, ?)",
  ).run(apiKey, method, path, status);
}
