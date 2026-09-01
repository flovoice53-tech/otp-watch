# otp-watch

Synthetic monitoring for SMS/email verification delivery. Point your own signup/OTP flow at a number or address this service gives you, then poll for whether — and how fast — the code actually arrives.

Most uptime monitors can tell you your API responded 200. None of them tell you whether the SMS or email your OTP provider promised to send actually showed up. This does just that one thing.

## How it works

Two ways to run a check, depending on how often you need one:

**One-off check** (`POST /checks`) — good for an occasional manual test. Rents a fresh target every time.
1. Call `POST /checks` and get back a real phone number (or a real disposable email address).
2. Your own system sends its normal verification SMS/email to that target — same way you'd send to a real user.
3. Poll `GET /checks/:id` until it's `received` (with latency in ms) or `timed_out`.

**Monitor** (€29/month) — for repeated/automated checks (e.g. every 15-30 min from your own cron/CI). A monitor rents ONE real phone number and keeps it for 30 days; every check against that monitor reuses the same number instead of renting a new one each time, unlimited checks included. This is the only sane way to run frequent SMS checks — a fresh rental per check would cost more per month than most companies would ever pay for this.
1. `POST /monitors/checkout` to get a Stripe Checkout link, pay there.
2. Once payment confirms (a few seconds), `GET /monitors` shows your new number.
3. On whatever schedule you want, call `POST /monitors/:id/checks`, trigger your own OTP send to the monitor's number, then poll `GET /checks/:id` for that check's result.

Either way, your own scheduler/alerting owns the decision of what "timed out" means for you — otp-watch doesn't send alerts itself, it just answers "did it arrive, and how fast."

## Quickstart

```bash
# get a key, no signup
curl -X POST https://otpwatch.flo-voice1.com/keys \
  -H "Content-Type: application/json" -d '{"email":"you@example.com"}'

# one-off check (fresh number/mailbox each time)
curl -X POST https://otpwatch.flo-voice1.com/checks \
  -H "Authorization: Bearer otpw_..." \
  -H "Content-Type: application/json" \
  -d '{"channel":"sms","timeoutSeconds":120}'
# => {"id":"...", "target":"+447...", "status":"pending", ...}

# OR: a monitor for repeated checks against the same number (€29/mo)
curl -X POST https://otpwatch.flo-voice1.com/monitors/checkout \
  -H "Authorization: Bearer otpw_..."
# => {"checkoutUrl":"https://checkout.stripe.com/..."} — open it, pay, then:

curl https://otpwatch.flo-voice1.com/monitors \
  -H "Authorization: Bearer otpw_..."
# => [{"id":"...", "target":"+447...", "expiresAt":"...", "status":"active"}]

curl -X POST https://otpwatch.flo-voice1.com/monitors/<monitor_id>/checks \
  -H "Authorization: Bearer otpw_..." \
  -H "Content-Type: application/json" -d '{"timeoutSeconds":120}'
# => {"id":"...", "status":"pending", ...} — trigger your OTP send now, then poll:

curl https://otpwatch.flo-voice1.com/checks/<id> \
  -H "Authorization: Bearer otpw_..."
# => {"status":"received", "latencyMs":4213, ...}
```

## Endpoints

| Endpoint | Description |
| --- | --- |
| `POST /keys` | Get an API key. No verification, self-serve. |
| `POST /checks` | One-off check. `{channel: "sms"\|"email", timeoutSeconds?: 10-600, default 120}`. Returns a real phone number or email address. |
| `GET /checks/:id` | Poll status: `pending`, `received` (with `latencyMs`), or `timed_out`. |
| `POST /monitors/checkout` | Get a Stripe Checkout link for a new monitor (€29/mo, unlimited checks). |
| `GET /monitors` | List your monitors, including `status` (`active`, `past_due`, `canceled`). |
| `POST /monitors/:id/checks` | Start a check against an existing monitor's number. 402 if the subscription isn't active. |
| `POST /monitors/portal` | Get a Stripe Billing Portal link to cancel or update payment method. |
| `GET /logs` | Last 50 checks for your key. |

## Pricing

- **One-off checks** (`POST /checks`) — free, both SMS and email.
- **SMS monitors** — €29/month per monitored number, unlimited checks, cancel anytime from the Stripe customer portal link in your receipt email.
- **Email monitors** — not offered; ad-hoc email checks are already free and cheap enough to just call per check.

## Known v1 limitations

- SMS numbers are UK-only (real GOIP hardware, same pool as [sms-florin](https://flo-voice1.com)).
- No push/webhook notification yet — you poll. No built-in scheduling — bring your own cron/CI.
- Monitors are SMS-only for now — email mailbox creation via receivemail.dev is already free/self-serve, so a fresh one per check isn't a cost problem the way SMS rentals are.
- SMS checks accept any sender to the rented number (it's not filtered by "service") — good for this use case, but the number isn't reserved to only your traffic during the check window.
- If a subscription lapses (`past_due`/`canceled`), the number itself isn't released early — it just stops accepting new checks until you resubscribe.
- While a monitor is `active`, its underlying phone number is kept continuously rented by a background sweep (independent of Stripe's exact billing-cycle timing) — the number may occasionally change if it's re-rented; always read `target` from `GET /monitors` rather than caching it.
