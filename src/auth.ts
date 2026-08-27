import { nanoid } from "nanoid";
import { db } from "./db.js";

export function issueApiKey(email: string): string {
  const key = `otpw_${nanoid(32)}`;
  db.prepare("INSERT INTO api_keys (key, email) VALUES (?, ?)").run(key, email);
  return key;
}

export function isValidApiKey(key: string): boolean {
  const row = db.prepare("SELECT 1 FROM api_keys WHERE key = ?").get(key);
  return row !== undefined;
}
