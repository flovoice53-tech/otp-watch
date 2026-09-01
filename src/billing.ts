import Stripe from "stripe";
import {
  activateMonitor,
  createMonitor,
  getStripeCustomerIdForApiKey,
  monitorExistsForStripeSession,
  setMonitorStatusBySubscription,
} from "./monitors.js";

// Flat monthly price per SMS monitor, unlimited checks — matches the real
// cost structure (sms-florin's own monthly rental is a flat ~7 EUR
// regardless of message volume), not per-check metering. Email stays free
// (receivemail.dev mailboxes have near-zero marginal cost), so there's no
// email monitor product to bill for.
const MONITOR_PRICE_CENTS = Number(process.env.OTP_WATCH_MONITOR_PRICE_CENTS ?? 2900);
const PUBLIC_URL = process.env.OTP_WATCH_PUBLIC_URL ?? "https://otpwatch.flo-voice1.com";

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(secretKey);
}

export async function createMonitorCheckoutUrl(apiKey: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "otp-watch SMS Monitor",
            description: "One persistently-rented UK number, unlimited SMS checks.",
          },
          unit_amount: MONITOR_PRICE_CENTS,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { apiKey },
    success_url: `${PUBLIC_URL}/monitors/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${PUBLIC_URL}/monitors/checkout/cancel`,
  });

  if (!session.url) throw new Error("Could not create the payment session.");
  return session.url;
}

// Lets a customer manage/cancel their own subscription without emailing us
// — Stripe's hosted Billing Portal handles cancellation, payment method
// updates, and invoice history. Requires the portal to be turned on once in
// the Stripe Dashboard (Settings > Billing > Customer portal); the API call
// itself doesn't configure it.
export async function createBillingPortalUrl(apiKey: string): Promise<string> {
  const customerId = getStripeCustomerIdForApiKey(apiKey);
  if (!customerId) throw new Error("No active subscription found for this API key.");

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: PUBLIC_URL,
  });
  return session.url;
}

export async function handleStripeWebhook(rawBody: string, signature: string): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const apiKey = session.metadata?.apiKey;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!apiKey || !subscriptionId || !customerId) break;
      // Stripe retries undelivered webhooks — without this check, a retry
      // would rent (and pay for) a second real number for the same payment.
      if (monitorExistsForStripeSession(session.id)) break;

      const monitor = await createMonitor(apiKey);
      activateMonitor(monitor.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeSessionId: session.id,
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      // Keeping the underlying phone number alive is handled separately by
      // reRentExpiringMonitors' periodic sweep (see monitors.ts) — it runs
      // off the real rental's own expiry, not Stripe's billing cycle, since
      // the two don't land on exactly the same day every month. This just
      // recovers status if a previous invoice had failed.
      if (subscriptionId && invoice.billing_reason === "subscription_cycle") {
        setMonitorStatusBySubscription(subscriptionId, "active");
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (subscriptionId) setMonitorStatusBySubscription(subscriptionId, "past_due");
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      setMonitorStatusBySubscription(subscription.id, "canceled");
      break;
    }
  }
}
