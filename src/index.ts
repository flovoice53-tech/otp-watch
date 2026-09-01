import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { issueApiKey, isValidApiKey } from "./auth.js";
import { createBillingPortalUrl, createMonitorCheckoutUrl, handleStripeWebhook } from "./billing.js";
import { getCheck, listChecks, startCheck, startMonitorCheck } from "./checks.js";
import { logRequest } from "./db.js";
import { listMonitors, reRentExpiringMonitors } from "./monitors.js";
import { LANDING_HTML } from "./landing.js";
import type { Channel } from "./types.js";

type Variables = { apiKey: string };

const app = new Hono<{ Variables: Variables }>();

const ROOT_JSON = {
  name: "otp-watch",
  description:
    "Synthetic monitoring for SMS/email verification delivery. Rent a real number or a test mailbox, trigger your own OTP send to it, then poll for arrival and latency.",
  docs: "https://github.com/flovoice53-tech/otp-watch",
};

// Browsers get the landing page; API clients (curl, fetch, anything not
// explicitly asking for HTML) get the JSON they always got.
app.get("/", (c) => {
  const accept = c.req.header("accept") ?? "";
  if (accept.includes("text/html")) {
    return c.html(LANDING_HTML);
  }
  return c.json(ROOT_JSON);
});

app.get("/robots.txt", (c) =>
  c.text(
    "User-agent: *\nAllow: /$\nDisallow: /checks\nDisallow: /monitors\nDisallow: /keys\nDisallow: /logs\nSitemap: https://otpwatch.flo-voice1.com/sitemap.xml\n",
  ),
);

app.get("/sitemap.xml", (c) =>
  c.text(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://otpwatch.flo-voice1.com/</loc></url>\n</urlset>\n`,
    200,
    { "content-type": "application/xml" },
  ),
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

// Monitors are paid — a monitor row only ever gets created by the Stripe
// webhook once a real subscription payment lands (see billing.ts). This
// endpoint just hands back a Checkout URL; it does not create anything.
monitors.post("/checkout", async (c) => {
  const apiKey = c.get("apiKey") as string;
  try {
    const url = await createMonitorCheckoutUrl(apiKey);
    return c.json({ checkoutUrl: url }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

monitors.get("/", (c) => {
  const apiKey = c.get("apiKey") as string;
  return c.json(listMonitors(apiKey));
});

monitors.post("/portal", async (c) => {
  const apiKey = c.get("apiKey") as string;
  try {
    const url = await createBillingPortalUrl(apiKey);
    return c.json({ portalUrl: url });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
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
    const status = message === "monitor not found" ? 404 : message.includes("checks are paused") ? 402 : 502;
    return c.json({ error: message }, status);
  }
});

app.route("/monitors", monitors);

// Unauthenticated — these are the Stripe Checkout success/cancel redirect
// targets a browser lands on after paying, not API calls with a bearer key.
app.get("/monitors/checkout/success", (c) =>
  c.json({
    message:
      "Payment received. Call GET /monitors with your API key in a few seconds to see your new monitor.",
  }),
);
app.get("/monitors/checkout/cancel", (c) => c.json({ message: "Checkout canceled — no charge made." }));

// Raw body required for Stripe's signature check — must be read before any
// JSON-parsing middleware would consume the stream.
app.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "missing stripe-signature header" }, 400);
  const rawBody = await c.req.text();
  try {
    await handleStripeWebhook(rawBody, signature);
    return c.json({ received: true });
  } catch (error) {
    console.error("stripe webhook error:", error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

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

// Keeps active monitors' underlying phone numbers continuously rented,
// independent of Stripe's billing-cycle timing — see reRentExpiringMonitors.
const RE_RENT_SWEEP_MS = 6 * 60 * 60 * 1000;
reRentExpiringMonitors().catch((error) => console.error("otp-watch: startup re-rent sweep failed:", error));
setInterval(() => {
  reRentExpiringMonitors().catch((error) => console.error("otp-watch: re-rent sweep failed:", error));
}, RE_RENT_SWEEP_MS);
