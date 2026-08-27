import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { issueApiKey, isValidApiKey } from "./auth.js";
import { getCheck, listChecks, startCheck, startMonitorCheck } from "./checks.js";
import { logRequest } from "./db.js";
import { createMonitor, listMonitors } from "./monitors.js";
import type { Channel } from "./types.js";

type Variables = { apiKey: string };

const app = new Hono<{ Variables: Variables }>();

app.get("/", (c) =>
  c.json({
    name: "otp-watch",
    description:
      "Synthetic monitoring for SMS/email verification delivery. Rent a real number or a test mailbox, trigger your own OTP send to it, then poll for arrival and latency.",
    docs: "https://github.com/flovoice53-tech/otp-watch",
  }),
);

app.post("/keys", async (c) => {
  const body = await c.req
    .json<{ email?: string }>()
    .catch(() => ({}) as { email?: string });
  if (!body.email) return c.json({ error: "email is required" }, 400);
  const key = issueApiKey(body.email);
  return c.json({ key }, 201);
});

const checks = new Hono<{ Variables: Variables }>();

checks.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!key || !isValidApiKey(key)) {
    return c.json({ error: "missing or invalid API key" }, 401);
  }
  c.set("apiKey", key);
  await next();
});

checks.post("/", async (c) => {
  const apiKey = c.get("apiKey") as string;
  const body = await c.req
    .json<{ channel?: Channel; timeoutSeconds?: number }>()
    .catch(() => ({}) as { channel?: Channel; timeoutSeconds?: number });

  if (body.channel !== "sms" && body.channel !== "email") {
    return c.json({ error: "channel must be 'sms' or 'email'" }, 400);
  }

  try {
    const check = await startCheck(apiKey, body.channel, body.timeoutSeconds);
    return c.json(check, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

checks.get("/:id", async (c) => {
  const apiKey = c.get("apiKey") as string;
  const check = await getCheck(apiKey, c.req.param("id"));
  if (!check) return c.json({ error: "not found" }, 404);
  return c.json(check);
});

app.route("/checks", checks);

const monitors = new Hono<{ Variables: Variables }>();

monitors.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!key || !isValidApiKey(key)) {
    return c.json({ error: "missing or invalid API key" }, 401);
  }
  c.set("apiKey", key);
  await next();
});

monitors.post("/", async (c) => {
  const apiKey = c.get("apiKey") as string;
  try {
    const monitor = await createMonitor(apiKey);
    return c.json(monitor, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

monitors.get("/", (c) => {
  const apiKey = c.get("apiKey") as string;
  return c.json(listMonitors(apiKey));
});

monitors.post("/:id/checks", async (c) => {
  const apiKey = c.get("apiKey") as string;
  const body = await c.req
    .json<{ timeoutSeconds?: number }>()
    .catch(() => ({}) as { timeoutSeconds?: number });
  try {
    const check = startMonitorCheck(apiKey, c.req.param("id"), body.timeoutSeconds);
    return c.json(check, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, message === "monitor not found" ? 404 : 502);
  }
});

app.route("/monitors", monitors);

app.get("/logs", (c) => {
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!key || !isValidApiKey(key)) {
    return c.json({ error: "missing or invalid API key" }, 401);
  }
  return c.json(listChecks(key));
});

app.use("*", async (c, next) => {
  await next();
  const auth = c.req.header("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  logRequest(key, c.req.method, c.req.path, c.res.status);
});

const port = Number(process.env.PORT ?? 3901);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`otp-watch listening on port ${info.port}`);
});
