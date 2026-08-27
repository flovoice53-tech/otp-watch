# otp-watch

Synthetic monitoring for SMS/email verification delivery. Point your own signup/OTP flow at a number or address this service gives you, then poll for whether — and how fast — the code actually arrives.

Most uptime monitors can tell you your API responded 200. None of them tell you whether the SMS or email your OTP provider promised to send actually showed up. This does just that one thing.

## How it works

Two ways to run a check, depending on how often you need one:

**One-off check** (`POST /checks`) — good for an occasional manual test. Rents a fresh target every time.
1. Call `POST /checks` and get back a real phone number (or a real disposable email address).
2. Your own system sends its normal verification SMS/email to that target — same way you'd send to a real user.
3. Poll `GET /checks/:id` until it's `received` (with latency in ms) or `timed_out`.

**Monitor** (`POST /monitors`) — for repeated/automated checks (e.g. every 15-30 min from your own cron/CI). A monitor rents ONE real phone number and keeps it for 30 days; every check against that monitor reuses the same number instead of renting a new one each time. This is the only sane way to run frequent SMS checks — a fresh rental per check would cost more per month than most companies would ever pay for this.
1. `POST /monitors` once to get a persistent number.
2. On whatever schedule you want, call `POST /monitors/:id/checks`, trigger your own OTP send to the monitor's number, then poll `GET /checks/:id` for that check's result.

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

# OR: a monitor for repeated checks against the same number
curl -X POST https://otpwatch.flo-voice1.com/monitors \
  -H "Authorization: Bearer otpw_..."
# => {"id":"...", "target":"+447...", "expiresAt":"..."}

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
| `POST /monitors` | Create a persistent SMS monitor (one real number, reused for 30 days). |
| `GET /monitors` | List your monitors. |
| `POST /monitors/:id/checks` | Start a check against an existing monitor's number. |
| `GET /logs` | Last 50 checks for your key. |

## Known v1 limitations

- SMS numbers are UK-only (real GOIP hardware, same pool as [sms-florin](https://flo-voice1.com)).
- No push/webhook notification yet — you poll. No built-in scheduling — bring your own cron/CI.
- Monitors are SMS-only for now — email mailbox creation via receivemail.dev is already free/self-serve, so a fresh one per check isn't a cost problem the way SMS rentals are.
- SMS checks accept any sender to the rented number (it's not filtered by "service") — good for this use case, but the number isn't reserved to only your traffic during the check window.
- No billing yet — free while this is unproven. Real cost (a UK number rental) is absorbed on our side for now.
