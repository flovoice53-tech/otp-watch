# otp-watch

Synthetic monitoring for SMS/email verification delivery. Point your own signup/OTP flow at a number or address this service gives you, then poll for whether — and how fast — the code actually arrives.

Most uptime monitors can tell you your API responded 200. None of them tell you whether the SMS or email your OTP provider promised to send actually showed up. This does just that one thing.

## How it works

1. You call `POST /checks` and get back a real phone number (or a real disposable email address).
2. Your own system sends its normal verification SMS/email to that target — same way you'd send to a real user.
3. You poll `GET /checks/:id` (from your own cron, CI job, or monitoring script) until it's `received` (with latency in ms) or `timed_out`.
4. Your own scheduler/alerting owns the decision of what "timed out" means for you — otp-watch doesn't send alerts itself, it just answers "did it arrive, and how fast."

## Quickstart

```bash
# get a key, no signup
curl -X POST https://otpwatch.flo-voice1.com/keys \
  -H "Content-Type: application/json" -d '{"email":"you@example.com"}'

# start a check
curl -X POST https://otpwatch.flo-voice1.com/checks \
  -H "Authorization: Bearer otpw_..." \
  -H "Content-Type: application/json" \
  -d '{"channel":"sms","timeoutSeconds":120}'
# => {"id":"...", "target":"+447...", "status":"pending", ...}

# now send your own OTP to that number/address, then poll:
curl https://otpwatch.flo-voice1.com/checks/<id> \
  -H "Authorization: Bearer otpw_..."
# => {"status":"received", "latencyMs":4213, ...}
```

## Endpoints

| Endpoint | Description |
| --- | --- |
| `POST /keys` | Get an API key. No verification, self-serve. |
| `POST /checks` | Start a check. `{channel: "sms"\|"email", timeoutSeconds?: 10-600, default 120}`. Returns a real phone number or email address. |
| `GET /checks/:id` | Poll status: `pending`, `received` (with `latencyMs`), or `timed_out`. |
| `GET /logs` | Last 50 checks for your key. |

## Known v1 limitations

- SMS numbers are UK-only (real GOIP hardware, same pool as [sms-florin](https://flo-voice1.com)).
- No push/webhook notification yet — you poll. No built-in scheduling or alerting — bring your own cron/CI and failure handling.
- SMS checks accept any sender to the rented number (it's not filtered by "service") — good for this use case, but the number isn't reserved to only your traffic during the check window.
- No billing yet — free while this is unproven. Real cost (a UK number rental) is absorbed on our side for now.
